import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { ScrapingResult, MangaInfo, ScrapingError, ScrapingOutcome, SiteInfo } from "../types/types";
import { getChapterElement } from "../API/seed";
import { getAllMangas } from "../API/queries/get";
import { setMangasInfo } from "../API/queries/update";
import { updateList } from "../database/graphql/graphql";
import { sendErrorMessage, sendUpdateMessages } from "../bot/messages";
import CustomClient from "../bot/classes/client";
import { addSiteToManga } from "../API/queries/create";
import { Page } from "puppeteer";

puppeteer.use(StealthPlugin());

function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

async function isValidPage(page: Page, url: string) : Promise<Boolean> {
    const toUrl = page.url().replace(/\/$/, "")
    const pageTitle = await page.title()

    const possibleErrorMessages = ["404", "Not found", "Page not found", "Error", "Sorry"]
    
    if (toUrl !== url) return false
    for (const messages of possibleErrorMessages) {
        if (pageTitle.toLowerCase().includes(messages.toLowerCase()))
            return false;
    }
    return true
}

async function startBrowser() {
    return await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
}

export async function scrapExistingSite(site: SiteInfo): Promise<void> {
    const browser = await startBrowser();
    const mangas: MangaInfo[] = await getAllMangas();

    for (const manga of mangas) {
        const url = site.url + replaceURL(manga.name)
        const page = await browser.newPage();

        await page.goto(url, {waitUntil: "domcontentloaded"});
        if (await isValidPage(page, url.replace(/\/$/, "")))
            await addSiteToManga(site.site, manga.name)
    }
}

export async function scrapeSiteInfo(elements: MangaInfo[]): Promise<ScrapingOutcome> {
    const browser = await startBrowser();

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

                const lastChapterText = await getChapterElement(page, site.chapter_url.split("/").at(-1) ?? "");

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
        await new Promise(f => setTimeout(f, 1000 * 15)); //Waits 30 seconds between each manga
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
