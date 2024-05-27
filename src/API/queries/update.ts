import { MangaInfo, ScrapingResult, SiteInfo } from "../../types/types";
import { putToApi } from "../helper";

export async function setMangasInfo(results: ScrapingResult[]): Promise<void> {
    if (!results) throw new Error("No results provided");
    try {
        results.forEach(async result => {
            await putToApi("manga/chapter", { name: result.manga.name, chapter: result.lastChapter });
        });
    } catch (error) {
        console.error(`Failed to set mangas info:`, error);
        throw error;
    }
}

export async function updateSiteInfo(site: SiteInfo): Promise<void> {
    if (!site) throw new Error("No site provided");
    try {
        await putToApi("site", site);
    } catch (error) {
        console.error(`Failed to update site:`, error);
        throw error;
    }
}

export async function updateMangaInfo(manga: MangaInfo): Promise<void> {
    if (!manga) throw new Error("No manga provided");
    try {
        await putToApi("manga", manga);
    } catch (error) {
        console.error(`Failed to update manga:`, error);
        throw error;
    }
}