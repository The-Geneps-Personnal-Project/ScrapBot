import { parentPort, threadId } from "worker_threads";
import { Browser, Page } from "puppeteer";
import { startBrowser } from "./browser";
import { MangaInfo, ScrapingResult, ScrapingError } from "../types/types";
import { getChapterElement } from "./seed";

let browser: Browser | null = null;

(async () => {
    browser = await startBrowser();
    
    parentPort?.on("message", async (task: { manga: MangaInfo }) => {
        const { manga } = task;
        if (!browser) browser = await startBrowser();
        const page: Page = await browser.newPage();

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

        const sendResponse = (response: { type: string; data?: ScrapingResult | ScrapingError; }) => {
            if (!responseSent) {
                clearTimeout(timeout);
                parentPort?.postMessage(response);
                responseSent = true;
            }
        };

        for (const site of manga.sites) {
            try {
                await page.goto(site.url + "/", { waitUntil: "networkidle2", timeout: 30000 });
                if (!page.url().includes(site.url)) continue;

                lastChapterText = await getChapterElement(page, site.chapter_url.split("/").at(-2) ?? "", site, manga);

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
                encounteredError = true
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
            responseSent = true;
        } else if (encounteredError && !foundNewChapter) {
            sendResponse({
                type: "error",
                data: { name: manga.name, error: "Failed to scrape any site for updates." } as ScrapingError,
            });
            responseSent = true;
        } else {
            sendResponse({
                type: "empty",
            });
            responseSent = true;
        }

        await page.close();
    });
    
    process.on("exit", async () => {
        await browser?.close();
        browser = null;
    });
})();
