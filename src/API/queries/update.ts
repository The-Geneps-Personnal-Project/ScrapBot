import { MangaInfo, ScrapingResult, SiteInfo } from "../../types/types";
import { putToApi } from "../helper";
import { invalidateCache } from "../cache";

/**
 * Persists the newly found chapter for each scraping result.
 *
 * Note the `for...of`: the previous version used `results.forEach(async r => await ...)`,
 * so the callback's promises were never awaited — the function resolved immediately
 * and its try/catch could not observe a single failure.
 */
export async function setMangasInfo(results: ScrapingResult[]): Promise<void> {
    if (!results?.length) return;

    for (const result of results) {
        await putToApi("mangas/chapter", {
            name: result.manga.name,
            chapter: result.lastChapter,
            last_updated: new Date().toISOString(),
        });
    }

    invalidateCache();
}

export async function updateSiteInfo(site: SiteInfo): Promise<void> {
    if (!site) throw new Error("No site provided");
    await putToApi("sites", site);
    invalidateCache();
}

export async function updateMangaInfo(manga: MangaInfo): Promise<void> {
    if (!manga) throw new Error("No manga provided");
    await putToApi("mangas", manga);
    invalidateCache();
}
