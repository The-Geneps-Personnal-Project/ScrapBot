import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { ScrapingResult, MangaInfo, ScrapingError, ScrapingOutcome } from "../types/types";
import { getChapterElement } from "../database/sqlite/seed";

puppeteer.use(StealthPlugin());

export async function scrapeSiteInfo(elements: MangaInfo[]): Promise<ScrapingOutcome> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: "/usr/bin/chromium-browser",
    });

    const scrapingResults: ScrapingResult[] = [];
    const scrapingErrors: ScrapingError[] = [];

    for (const manga of elements) {
        if (!manga.alert) continue;

        let maxChapter = Number(manga.chapter);
        let maxChapterSite = null;
        let encounteredErrors = false;
        let foundNewChapter = false;

        for (const site of manga.sites) {
            const page = await browser.newPage();
            try {
                await page.goto(site.url, { waitUntil: "domcontentloaded" });

                const lastChapterText = await getChapterElement(page);

                const lastChapterTextMatch = lastChapterText?.match(/\d+(\.\d+)?/);
                const lastChapter = lastChapterTextMatch ? parseFloat(lastChapterTextMatch[0]) : NaN;

                console.log(`Scraped ${manga.name} at ${site.url}:`, lastChapter);

                if (!isNaN(lastChapter)) {
                    foundNewChapter = true;
                    if (lastChapter > maxChapter) {
                        maxChapter = lastChapter;
                        maxChapterSite = site;
                    }
                }
            } catch (error) {
                encounteredErrors = true;
                console.error(`Error scraping ${manga.name} at ${site.url}:`, error);
            } finally {
                await page.close();
            }
        }

        if (maxChapterSite !== null) {
            scrapingResults.push({
                manga,
                lastChapter: maxChapter.toString(),
                site: maxChapterSite,
            });
        } else if (!foundNewChapter && encounteredErrors) {
            scrapingErrors.push({
                name: manga.name,
                error: "Failed to scrape any site for updates.",
            });
        }
        await new Promise(f => setTimeout(f, 1000 * 30)); //Waits 30 seconds between each manga
    }

    await browser.close();
    return [scrapingResults, scrapingErrors];
}