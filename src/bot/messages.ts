import { ScrapingError, ScrapingResult } from "../types/types";
import CustomClient from "./classes/client";

export async function sendUpdateMessages(ResultInfos: ScrapingResult[], client: CustomClient) {
    for (const { manga, lastChapter, site } of ResultInfos) {
        await client.chans
            .get("updates")
            ?.send(
                `${manga.name} : ${manga.chapter} -> ${lastChapter} at <${site.chapter_url + site.chapter_limiter + (+manga.chapter + 1)}>`
            );
    }
}

export async function sendErrorMessage(ScrapInfos: ScrapingError[], client: CustomClient) {
    for (const { name, error } of ScrapInfos) {
        await client.chans.get("error")?.send(`Error scraping ${name}: ${error}`);
    }
}
