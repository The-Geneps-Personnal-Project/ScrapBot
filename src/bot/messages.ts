import { ScrapingError, ScrapingResult } from "../types/types";
import CustomClient from "./classes/client";

export async function sendUpdateMessages(ResultInfos: ScrapingResult[], client: CustomClient) {
    client.logger(`Sending ${ResultInfos.length} update messages`);
    for (const { manga, lastChapter, site, url } of ResultInfos) {
        await client.chans
            .get("updates")
            ?.send(
                `${manga.name} : ${manga.chapter} -> ${lastChapter} at <${url}>`
            );
    }
}

export async function sendErrorMessage(ScrapInfos: ScrapingError[], client: CustomClient) {
    for (const { name, error } of ScrapInfos) {
        await client.chans.get("error")?.send(`Error scraping ${name}: ${error}`);
    }
}
