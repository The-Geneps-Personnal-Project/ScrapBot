import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import {
    ScrapingResult,
    MangaInfo,
    ScrapingError,
    ScrapingOutcome,
} from "./types";

puppeteer.use(StealthPlugin());

export async function scrapeSiteInfo(
    elements: MangaInfo[],
): Promise<ScrapingOutcome> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: "/usr/bin/chromium-browser",
    });

    const scrapingResults: ScrapingResult[] = [];
    const scrapingErrors: ScrapingError[] = [];

    for (const manga of elements) {
        if (!manga.alert) continue;

        let maxChapter = -1;
        let maxChapterSite = null;
        let encounteredErrors = true;

        for (const site of manga.sites) {
            const page = await browser.newPage();
            try {
                await page.goto(site.url, { waitUntil: "domcontentloaded" });
                await page.waitForSelector(site.selector);

                const lastChapterText = await page.evaluate((selector: string) => {
                    const content = document.querySelector(selector);
                    return content ? content.textContent || (content as HTMLElement).innerText : undefined;
                }, site.selector);

                const lastChapter = parseInt(lastChapterText || '', 10);

                if (!isNaN(lastChapter) && lastChapter > maxChapter) {
                    maxChapter = lastChapter;
                    maxChapterSite = site;
                    encounteredErrors = false;
                }
            } catch (error) {
                console.error(`Error scraping ${manga.name} at ${site.url}:`, error);
            } finally {
                await page.close();
            }
        }

        if (maxChapterSite !== null) {
            scrapingResults.push({ manga, lastChapter: maxChapter.toString(), site: maxChapterSite});
        } else if (encounteredErrors) {
            scrapingErrors.push({ name: manga.name, error: "Failed to scrape any site.", url: manga.sites.map(site => site.url).join(", ") });
        }
    }

    await browser.close();
    return [scrapingResults, scrapingErrors];
}
