import { parentPort, threadId } from "worker_threads";
import { MangaInfo, ScrapingResult, ScrapingError } from "../types/types";
import { getChapterElement } from "./seed";
import { fetchSiteDOM } from "../utils/fetch";


(async () => {
    parentPort?.on("message", async (task: { manga: MangaInfo }) => {
        const { manga } = task;

        let maxChapter = Number(manga.chapter);
        let maxChapterSite: MangaInfo["sites"][number] | null = null;
        let maxChapterURL = "";
        let lastChapterText = "";

        let foundNewChapter = false;
        let encounteredError = false;
        let responseSent = false;

        const timeout = setTimeout(() => {
            if (!responseSent) {
                parentPort?.postMessage({ type: "empty" });
                responseSent = true;
            }
        }, 2 * 60 * 1000); // 2 minutes

        const sendResponse = (response: { type: string; data?: ScrapingResult | ScrapingError }) => {
            if (!responseSent) {
                clearTimeout(timeout);
                parentPort?.postMessage(response);
                responseSent = true;
            }
        };

        for (const site of manga.sites) {
            try {
                const document = await fetchSiteDOM(site.url);

                console.log(`[${new Date().toLocaleString()}] Worker ${threadId} Going ${document.location.href}, looking for ${site.url}`);

                if (!document.location.href.includes(site.url)) continue;

                lastChapterText = await getChapterElement(document, site.chapter_url.split("/").at(-2) ?? "", site, manga);

                const lastChapterTextMatch = lastChapterText
                    ?.replace(/\/$/, "")
                    ?.split("/")
                    .at(-1)
                    ?.match(/(\d+(?:[\.-]\d+)?)/);
                const lastChapter = lastChapterTextMatch ? parseFloat(lastChapterTextMatch[0].replace("-", ".")) : NaN;

                console.log(
                    `[${new Date().toLocaleString()}] Worker ${threadId} Scraped ${manga.name} at ${site.url}: ${lastChapter}`
                );

                if (!isNaN(lastChapter)) {
                    if (lastChapter > maxChapter) {
                        maxChapter = lastChapter;
                        maxChapterSite = site;
                        maxChapterURL = lastChapterText;
                    }
                    foundNewChapter = true;
                }
            } catch (error) {
                console.error(`[${new Date().toLocaleString()}] Worker ${threadId} Failed to scrape ${manga.name} at ${site.url}: ${error}`);
                encounteredError = true;
            }
        }

        if (maxChapterSite !== null) {
            sendResponse({
                type: "result",
                data: {
                    manga,
                    lastChapter: maxChapter.toString(),
                    site: maxChapterSite,
                    url: maxChapterURL,
                } as ScrapingResult,
            });
        } else if (encounteredError && !foundNewChapter) {
            sendResponse({
                type: "error",
                data: { name: manga.name, error: "Failed to scrape any site for updates." } as ScrapingError,
            });
        } else {
            sendResponse({
                type: "empty",
            });
        }
    });
})();
