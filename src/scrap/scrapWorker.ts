import { parentPort, threadId } from "worker_threads";

import { MangaInfo, ScrapingResult, SiteInfo, WorkerTask } from "../types/types";
import { getChapterLinks } from "./seed";
import { withSiteDOM } from "../utils/fetch";

const log = (message: string) => console.log(`[${new Date().toLocaleString()}] Worker ${threadId} ${message}`);

interface Candidate {
    chapter: number;
    href: string;
    site: SiteInfo;
}

interface ScrapeOutcome {
    /** Highest chapter released across every site. */
    latest: Candidate | null;
    /** Lowest unread chapter — the one the reader should open first. */
    next: Candidate | null;
    /** Sites that threw. Used to tell "no new chapter" apart from "every site is broken". */
    failures: number;
}

/**
 * Scrapes one manga across all of its sites.
 *
 * There is deliberately no timeout here: the parent pool owns the per-task deadline
 * and kills the worker outright when it expires. The previous worker-side timeout
 * only *reported* "empty" while leaving the site loop running, so the pool would
 * hand this thread a second manga while the first was still in flight.
 */
async function scrapeManga(manga: MangaInfo): Promise<ScrapeOutcome> {
    const currentChapter = Number(manga.chapter) || 0;
    const candidates: Candidate[] = [];
    let failures = 0;

    for (const site of manga.sites) {
        try {
            const links = await withSiteDOM(site.url, async page => {
                if (page.redirected) {
                    log(`${site.url} redirected to ${page.finalUrl}, skipping.`);
                    return [];
                }
                return getChapterLinks(page.document, site.chapter_url.split("/").at(-2) ?? "", site, manga);
            });

            for (const link of links) {
                if (link.chapter > currentChapter) {
                    candidates.push({ chapter: link.chapter, href: link.href, site });
                }
            }

            log(`Scraped ${manga.name} at ${site.url}: ${links.length} chapter link(s)`);
        } catch (error) {
            failures++;
            log(`Failed to scrape ${manga.name} at ${site.url}: ${(error as Error).message}`);
        }
    }

    if (candidates.length === 0) return { latest: null, next: null, failures };

    // Sorting ascending makes the first entry the oldest unread chapter and the last
    // the newest. When 505 is read and 506..510 are out, `next` is 506 and `latest`
    // is 510 — the notification reports the range but links what to actually open.
    candidates.sort((a, b) => a.chapter - b.chapter);

    return {
        latest: candidates[candidates.length - 1],
        next: candidates[0],
        failures,
    };
}

parentPort?.on("message", async (task: WorkerTask) => {
    const { manga } = task;

    try {
        const { latest, next, failures } = await scrapeManga(manga);

        if (latest && next) {
            parentPort?.postMessage({
                type: "result",
                data: {
                    manga,
                    lastChapter: latest.chapter.toString(),
                    nextChapter: next.chapter.toString(),
                    site: next.site,
                    url: next.href,
                } satisfies ScrapingResult,
            });
        } else if (failures > 0 && failures === manga.sites.length) {
            // Every site failed — that is a scraping problem worth reporting, unlike
            // simply finding no new chapter.
            parentPort?.postMessage({
                type: "error",
                data: { name: manga.name, error: `All ${failures} site(s) failed to scrape.` },
            });
        } else {
            parentPort?.postMessage({ type: "empty" });
        }
    } catch (error) {
        parentPort?.postMessage({
            type: "error",
            data: { name: manga.name, error: (error as Error).message },
        });
    }
});
