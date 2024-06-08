import { MangaInfo, ScrapingResult, SiteInfo } from "../../types/types";
import { putToApi } from "../helper";

export async function setMangasInfo(results: ScrapingResult[]): Promise<void> {
    if (!results) throw new Error("No results provided");
    try {
        results.forEach(async result => {
            await putToApi("mangas/chapter", {
                name: result.manga.name,
                chapter: result.lastChapter,
                last_updated: new Date().toISOString(),
            });
        });
    } catch (error) {
        console.error(`Failed to set mangas info:`, error);
        throw error;
    }
}

export async function updateSiteInfo(site: SiteInfo): Promise<void> {
    if (!site) throw new Error("No site provided");
    try {
        await putToApi("sites", site);
    } catch (error) {
        console.error(`Failed to update site:`, error);
        throw error;
    }
}

export async function updateMangaInfo(manga: MangaInfo): Promise<void> {
    if (!manga) throw new Error("No manga provided");
    try {
        await putToApi("mangas", manga);
    } catch (error) {
        console.error(`Failed to update manga:`, error);
        throw error;
    }
}
