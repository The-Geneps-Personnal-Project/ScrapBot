import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { ScrapingResult, MangaInfo, ScrapingError, ScrapingOutcome } from "../types/types";
import { getChapterElement } from "../API/seed";
import { getAllMangas } from "../API/queries/get";
import { setMangasInfo } from "../API/queries/update";
import { updateList } from "../database/graphql/graphql";
import { sendErrorMessage, sendUpdateMessages } from "../bot/messages";
import CustomClient from "../bot/classes/client";

puppeteer.use(StealthPlugin());

export async function scrapeSiteInfo(elements: MangaInfo[]): Promise<ScrapingOutcome> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
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

                const lastChapterTextMatch = lastChapterText?.match(/(\d+(\.\d+)?)(?!.*\d)/);
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

export async function initiateScraping(client: CustomClient) {
    const mangas: MangaInfo[] = await getAllMangas();

    await client.chans.get("updates")?.bulkDelete(100);

    const [result, errors] = await scrapeSiteInfo(mangas);
    if (errors && errors.length > 0) sendErrorMessage(errors, client);
    if (result && result.length > 0) {
        try {
            await sendUpdateMessages(result, client);
            setMangasInfo(result);
            await updateList(result);
        } catch (error) {
            console.error(`Failed to update:`, error);
        }
    } else {
        client.chans.get("updates")?.send("No new chapters found.");
    }
}
