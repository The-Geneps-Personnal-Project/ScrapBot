import { Worker } from "worker_threads";
import path from "path";

import {
    MangaInfo,
    ScrapingError,
    ScrapingOutcome,
    ScrapingResult,
    SiteInfo,
    WorkerMessage,
    linkResult,
} from "../types/types";
import { getAllMangas } from "../API/queries/get";
import { setMangasInfo } from "../API/queries/update";
import { updateList } from "../database/graphql/graphql";
import { sendErrorMessage, sendUpdateMessages } from "../bot/messages";
import CustomClient from "../bot/classes/client";
import { addSiteToManga } from "../API/queries/create";
import { replaceURL, isValidPage, mapWithConcurrency } from "../utils/utils";
import { withSiteDOM } from "../utils/fetch";

const THREAD_POOL_SIZE = Number(process.env.THREADS) || 4;

/**
 * Per-manga budget. A manga is checked against every one of its sites, so this has
 * to cover several sequential fetches (each capped at DEFAULT_FETCH_TIMEOUT_MS).
 */
const TASK_TIMEOUT_MS = 3 * 60 * 1000;

/** Hard ceiling on a whole run, so a pathological queue cannot occupy the pool forever. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

/** Parallel HTTP requests when linking one entity against many — polite, but not serial. */
const LINK_CONCURRENCY = 4;

/**
 * Guards against overlapping runs: the 3-hourly cron can otherwise re-enter while a
 * previous run (or a manual /run) is still going, doubling thread pressure.
 */
let scrapingInProgress = false;

export function isScrapingInProgress(): boolean {
    return scrapingInProgress;
}

export interface RunSummary {
    startedAt: Date;
    finishedAt: Date;
    results: number;
    errors: number;
}

/** Outcome of the most recent run, so /status can report more than a countdown. */
let lastRun: RunSummary | null = null;

export function getLastRun(): RunSummary | null {
    return lastRun;
}

class TaskTimeoutError extends Error {
    constructor(mangaName: string) {
        super(`Timed out after ${TASK_TIMEOUT_MS}ms scraping ${mangaName}`);
        this.name = "TaskTimeoutError";
    }
}

function spawnWorker(): Worker {
    return new Worker(path.join(__dirname, "scrapWorker.js"));
}

/**
 * Sends one manga to a worker and resolves with its reply.
 *
 * Every listener registered here is removed in `cleanup`. That matters as much as
 * the timeout: the previous implementation used a permanent `on("message")` handler
 * per worker, so each run stacked another listener that captured *that run's*
 * result arrays and kept them alive.
 */
function runTask(worker: Worker, manga: MangaInfo): Promise<WorkerMessage> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new TaskTimeoutError(manga.name));
        }, TASK_TIMEOUT_MS);

        const onMessage = (message: WorkerMessage) => {
            cleanup();
            resolve(message);
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };
        const onExit = (code: number) => {
            cleanup();
            reject(new Error(`Worker exited with code ${code} while scraping ${manga.name}`));
        };

        function cleanup() {
            clearTimeout(timer);
            worker.off("message", onMessage);
            worker.off("error", onError);
            worker.off("exit", onExit);
        }

        worker.on("message", onMessage);
        worker.on("error", onError);
        worker.on("exit", onExit);
        worker.postMessage({ manga });
    });
}

export async function scrapeSiteInfo(client: CustomClient, elements: MangaInfo[]): Promise<ScrapingOutcome> {
    const results: ScrapingResult[] = [];
    const errors: ScrapingError[] = [];

    client.logger(`Client has ${client.dailyFeed.length} mangas in daily feed.`);

    const queue = elements.filter(
        manga =>
            // Must-watch entries are backlog items: never scraped, never alerted on.
            // Checked explicitly rather than relying on alert alone, so a manually
            // flipped alert cannot pull one back into the rotation.
            manga.status !== "must_watch" &&
            manga.alert === 1 &&
            manga.sites.length > 0 &&
            !client.dailyFeed.some(entry => entry.name === manga.name)
    );

    if (queue.length === 0) {
        client.logger("Nothing to scrape.");
        return [results, errors];
    }

    const poolSize = Math.min(THREAD_POOL_SIZE, queue.length);
    // One slot per worker. Slots are replaced in place when a worker has to be killed.
    const pool: (Worker | null)[] = new Array(poolSize).fill(null);
    let aborted = false;

    const runTimer = setTimeout(() => {
        aborted = true;
        queue.length = 0;
        client.logger(`Global timeout reached after ${RUN_TIMEOUT_MS / 60000}min. Terminating workers...`);
        // Terminating makes any in-flight runTask reject via its "exit" listener,
        // which unwinds the slots instead of leaving them hanging.
        for (const worker of pool) void worker?.terminate();
    }, RUN_TIMEOUT_MS);

    const runSlot = async (slot: number): Promise<void> => {
        pool[slot] = spawnWorker();

        while (!aborted) {
            const manga = queue.shift();
            if (!manga) return;

            const worker = pool[slot];
            if (!worker) return;

            try {
                const message = await runTask(worker, manga);

                if (message.type === "result") {
                    results.push(message.data);
                    client.dailyFeed.push({
                        name: message.data.manga.name,
                        from: message.data.manga.chapter,
                        to: message.data.lastChapter,
                        next: message.data.nextChapter,
                        url: message.data.url,
                        site: message.data.site?.site ?? "",
                        at: new Date().toISOString(),
                    });
                } else if (message.type === "error") {
                    errors.push(message.data);
                }
            } catch (error) {
                if (aborted) return;

                client.logger(`Slot ${slot} failed on ${manga.name}: ${(error as Error).message}`);
                errors.push({ name: manga.name, error: (error as Error).message });

                // The worker is in an unknown state — it may still be mid-loop after a
                // timeout. Kill it and start a fresh one so it can never end up running
                // two scrape loops at once.
                await worker.terminate().catch(() => undefined);
                pool[slot] = aborted ? null : spawnWorker();
            }
        }
    };

    try {
        await Promise.all(Array.from({ length: poolSize }, (_, slot) => runSlot(slot)));
    } finally {
        clearTimeout(runTimer);
        // Unconditional teardown. This is the fix for the leak: the old code faked an
        // "exit" event with worker.emit("exit", 0), which removed the worker from its
        // bookkeeping array but never stopped the underlying thread.
        const terminations = await Promise.allSettled(pool.map(worker => worker?.terminate()));
        client.logger(`Terminated ${terminations.filter(t => t.status === "fulfilled").length} workers.`);
        pool.fill(null);
    }

    client.logger(`Scraping completed. Results: ${results.length}, Errors: ${errors.length}`);
    return [results, errors];
}

/**
 * Checks whether `manga` exists on each of `sites`, and links the ones that answer.
 * Used when a manga is created: one new manga against the known sites.
 */
export async function linkMangaToSites(manga: MangaInfo, sites: SiteInfo[]): Promise<linkResult> {
    return linkPairs(
        sites.map(site => ({ site, manga })),
        pair => pair.site.site
    );
}

/**
 * Checks whether each of `mangas` exists on `site`, and links the ones that answer.
 * Used when a site is created: one new site against the known mangas.
 */
export async function linkSiteToMangas(site: SiteInfo, mangas: MangaInfo[]): Promise<linkResult> {
    return linkPairs(
        mangas.map(manga => ({ site, manga })),
        pair => pair.manga.name
    );
}

/**
 * Shared body of the two link helpers.
 *
 * Splitting the public entry points by intent replaces the old `'url' in data`
 * discriminator, which inferred "site or manga?" by introspection and silently
 * mis-classified a malformed `{}` as a manga — the origin of the
 * "Cannot read properties of undefined (reading 'replace')" crash.
 */
async function linkPairs(
    pairs: { site: SiteInfo; manga: MangaInfo }[],
    label: (pair: { site: SiteInfo; manga: MangaInfo }) => string
): Promise<linkResult> {
    const linked: string[] = [];
    const failures: ScrapingError[] = [];

    await mapWithConcurrency(pairs, LINK_CONCURRENCY, async pair => {
        const { site, manga } = pair;

        if (!site?.url || !manga?.name) {
            failures.push({ name: label(pair), error: "Incomplete site or manga record" });
            return;
        }

        const url = site.url + replaceURL(manga.name);

        try {
            const matched = await withSiteDOM(url, page => isValidPage(page, url.replace(/\/$/, "")));

            if (matched) {
                await addSiteToManga(site.site, manga.name);
                linked.push(label(pair));
            }
        } catch (error) {
            failures.push({ name: label(pair), error: (error as Error).message });
        }
    });

    console.log(`Linked ${linked.length} of ${pairs.length} candidates (${failures.length} failures).`);
    return [linked.length, linked, failures];
}

export async function initiateScraping(client: CustomClient): Promise<void> {
    if (scrapingInProgress) {
        client.logger("Scraping already in progress, skipping this trigger.");
        return;
    }

    scrapingInProgress = true;
    const startedAt = Date.now();

    let results: ScrapingResult[] = [];
    let errors: ScrapingError[] = [];

    try {
        const mangas = await getAllMangas();
        [results, errors] = await scrapeSiteInfo(client, mangas);

        if (errors.length > 0) await sendErrorMessage(errors, client);

        if (results.length > 0) {
            try {
                await sendUpdateMessages(results, client);
                await setMangasInfo(results);
                await updateList(results);
            } catch (error) {
                client.logger(`Failed to publish updates: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        client.logger(`Scraping run failed: ${(error as Error).message}`);
    } finally {
        scrapingInProgress = false;
        lastRun = {
            startedAt: new Date(startedAt),
            finishedAt: new Date(),
            results: results.length,
            errors: errors.length,
        };
        client.logger(`Execution time: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    }
}
