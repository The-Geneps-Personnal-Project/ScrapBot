import { ScrapingResult, MangaInfo, ScrapingError, ScrapingOutcome, SiteInfo, linkResult, CustomWorker } from "../types/types";
import { getAllMangas, getAllSites } from "../API/queries/get";
import { setMangasInfo } from "../API/queries/update";
import { updateList } from "../database/graphql/graphql";
import { sendErrorMessage, sendUpdateMessages } from "../bot/messages";
import CustomClient from "../bot/classes/client";
import { addSiteToManga } from "../API/queries/create";
import { replaceURL, isValidPage } from "../utils/utils";
import { Worker } from 'worker_threads';
import { startBrowser } from "./browser";
import path from "path";

const workers: CustomWorker[] = [];
const THREAD_POOL_SIZE = Number(process.env.THREADS) || 4;

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
    const scrapingResults: ScrapingResult[] = [];
    const scrapingErrors: ScrapingError[] = [];

    const mangaQueue = [...elements.filter((manga) => manga.alert === 1 && manga.sites.length > 0)];

    const initializeWorker = (): CustomWorker => {
        const worker = new Worker(path.join(__dirname + '/scrapWorker.js'));
        const customWorker: CustomWorker = { worker, status: false, name: `Worker ${worker.threadId}` };

        customWorker.worker.on('message', (message) => {
            if (message.type === 'result') {
                scrapingResults.push(message.data);
            } else if (message.type === 'error') {
                scrapingErrors.push(message.data);
            }
            customWorker.status = false;
            assignTaskToWorker(customWorker);
        });

        customWorker.worker.on('error', (error) => {
            client.logger(`Error in ${customWorker.name}: ${error}`);
            customWorker.status = false;
            assignTaskToWorker(customWorker);
        });

        customWorker.worker.on('exit', (code) => {
            if (code !== 0) client.logger(`${customWorker.name} stopped with exit code ${code}`);
            workers.splice(workers.indexOf(customWorker), 1);
        });

        return customWorker;
    };

    const assignTaskToWorker = (worker: CustomWorker) => {
        if (worker.status) return;
        if (mangaQueue.length === 0) return;

        const manga = mangaQueue.shift();
        if (manga) {
            client.logger(`Assigning task for ${manga.name} to ${worker.name}`);
            worker.status = true;
            worker.worker.postMessage({ manga });
        }
    };

    for (let i = 0; i < THREAD_POOL_SIZE && workers.length !== THREAD_POOL_SIZE; i++) workers.push(initializeWorker());

    const globalTimeout = setTimeout(() => {
        client.logger(`Global timeout reached. Terminating all workers...`);
        for (const worker of workers) {
            worker.worker.terminate();
            worker.status = false;
            client.logger(`Worker ${worker.name} terminated and reset.`);
        }
        mangaQueue.length = 0;
        client.logger(`Queue cleared.`);
    }, 30 * 60 * 1000); // 30 minutes

    while (workers.some(worker => worker.status) || mangaQueue.length > 0) {
        for (const worker of workers) assignTaskToWorker(worker);
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    clearTimeout(globalTimeout);

    client.logger(`Scraping completed. Results: ${scrapingResults.length}, Errors: ${scrapingErrors.length}`);
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
