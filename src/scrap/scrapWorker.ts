import { parentPort, threadId } from "worker_threads";
import { Browser, Page } from "puppeteer";
import { startBrowser } from "./browser";
import { MangaInfo, ScrapingResult, ScrapingError } from "../types/types";
import { getChapterElement } from "./seed";

(async () => {
    const browser: Browser = await startBrowser();

    parentPort?.on("message", async (task: { manga: MangaInfo }) => {
        const { manga } = task;
        const page: Page = await browser.newPage();

        try {
            let maxChapter = Number(manga.chapter);
            let maxChapterSite: MangaInfo["sites"][number] | null = null;
            let maxChapterURL = "";
            let lastChapterText = "";

            for (const site of manga.sites) {
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
                }
            }

            if (maxChapterSite !== null) {
                parentPort?.postMessage({
                    type: "result",
                    data: {
                        manga,
                        lastChapter: maxChapter.toString(),
                        site: maxChapterSite,
                        url: maxChapterURL,
                    } as ScrapingResult,
                });
            } else {
                parentPort?.postMessage({
                    type: "error",
                    data: { name: manga.name, error: "Failed to scrape any site for updates." } as ScrapingError,
                });
            }
        } catch (error: any) {
            parentPort?.postMessage({
                type: "error",
                data: { name: manga.name, error: error.message } as ScrapingError,
            });
        } finally {
            await page.close();
        }
    });

    process.on("exit", async () => {
        await browser.close();
    });
})();
