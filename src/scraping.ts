import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { ScrapingResult, MangaInfo, ScrapingError, ScrapingOutcome } from "./types";

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
                await page.waitForSelector(site.selector);

                const lastChapterText = await page.evaluate((selector: string) => {
                    const content = document.querySelector(selector);
                    return content ? content.textContent || (content as HTMLElement).innerText : undefined;
                }, site.selector);

                const lastChapterTextMatch = lastChapterText?.match(/\d+(\.\d+)?/);
                const lastChapter = lastChapterTextMatch ? parseFloat(lastChapterTextMatch[0]) : NaN;

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
    }

    await browser.close();
    return [scrapingResults, scrapingErrors];
}
