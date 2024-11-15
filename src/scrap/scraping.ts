import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { ScrapingResult, MangaInfo, ScrapingError, ScrapingOutcome, SiteInfo, linkResult } from "../types/types";
import { getChapterElement } from "../API/seed";
import { getAllMangas, getAllSites } from "../API/queries/get";
import { setMangasInfo } from "../API/queries/update";
import { updateList } from "../database/graphql/graphql";
import { sendErrorMessage, sendUpdateMessages } from "../bot/messages";
import CustomClient from "../bot/classes/client";
import { addSiteToManga } from "../API/queries/create";
import { replaceURL, isValidPage } from "../utils/utils";

puppeteer.use(StealthPlugin());

async function startBrowser() {
    return await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
}

export async function scrapExistingSite(
    data: SiteInfo | MangaInfo,
    exceptions: SiteInfo[] | MangaInfo[]
): Promise<linkResult> {
    const browser = await startBrowser();

    // Determine if data is a Site or a Manga
    const items = 'url' in data ? await getAllMangas() : await getAllSites();
    const isSite = (item: any): item is SiteInfo => 'url' in item;

    const filteredItems = exceptions.length > 0 ? exceptions: items;

    let count = 0;
    let list: string[] = [];

    for (const item of filteredItems) {
        const site = isSite(data) ? data : (item as SiteInfo);
        const manga = isSite(data) ? (item as MangaInfo) : data;
        const url = site.url + replaceURL(manga.name);

        try {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded' });

            if (await isValidPage(page, url.replace(/\/$/, ''))) {
                await addSiteToManga(site.site, manga.name);
                count++;
                list.push(isSite(data) ? manga.name : site.site);
            }

            await page.close();
        } catch (error) {
            console.error(`Failed to scrap ${site.site} for ${manga.name}: ${error}`);
        }
    }

    await browser.close()
    return [count, list];
}


export async function scrapeSiteInfo(client: CustomClient, elements: MangaInfo[]): Promise<ScrapingOutcome> {
    const browser = await startBrowser();

    const scrapingResults: ScrapingResult[] = [];
    const scrapingErrors: ScrapingError[] = [];

    for (const manga of elements) {
        if (!manga.alert) continue;

        let maxChapter = Number(manga.chapter);
        let maxChapterSite = null;
        let maxChapterURL = "";
        let lastChapterText = "";
        let encounteredErrors = false;
        let foundNewChapter = false;

        for (const site of manga.sites) {
            const page = await browser.newPage();
            try {
                await page.goto(site.url + "/", { waitUntil: "networkidle2", timeout: 0 });

                if (!page.url().includes(site.url)) continue;

                lastChapterText = await getChapterElement(page, site.chapter_url.split("/").at(-2) ?? "", site, manga);

                const lastChapterTextMatch = lastChapterText?.replace(/\/$/, '')?.split('/').at(-1)?.match(/(\d+(?:[\.-]\d+)?)/);
                const lastChapter = lastChapterTextMatch ? parseFloat(lastChapterTextMatch[0].replace('-', '.')) : NaN;
                
                client.logger(`Scraped ${manga.name} at ${site.url}: ${lastChapter}`);

                if (!isNaN(lastChapter)) {
                    foundNewChapter = true;
                    if (lastChapter > maxChapter) {
                        maxChapter = lastChapter;
                        maxChapterSite = site;
                        maxChapterURL = lastChapterText;
                    }
                }
            } catch (error) {
                encounteredErrors = true;
                client.logger(`Error scraping ${manga.name} at ${site.url}: ${error}`);
            } finally {
                await page.close();
            }
        }

        if (maxChapterSite !== null) {
            scrapingResults.push({
                manga,
                lastChapter: maxChapter.toString(),
                site: maxChapterSite,
                url: maxChapterURL
            });
        } else if (!foundNewChapter && encounteredErrors) {
            scrapingErrors.push({
                name: manga.name,
                error: "Failed to scrape any site for updates.",
            });
        }
        await new Promise(f => setTimeout(f, 1000 * 7.5)); //Waits 7.5 seconds between each loop
    }

    await browser.close();
    return [scrapingResults, scrapingErrors];
}

export async function initiateScraping(client: CustomClient) {
    const mangas: MangaInfo[] = await getAllMangas();

    await client.chans.get("updates")?.bulkDelete(100);

    const [result, errors] = await scrapeSiteInfo(client, mangas);
    if (errors && errors.length > 0) sendErrorMessage(errors, client);
    if (result && result.length > 0) {
        try {
            await sendUpdateMessages(result, client);
            setMangasInfo(result);
            await updateList(result);
        } catch (error) {
            client.logger(`Failed to update: ${error}`);
        }
    } else {
        client.chans.get("updates")?.send("No new chapters found.");
    }
}
