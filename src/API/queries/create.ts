import { MangaInfo, SiteInfo } from "../../types/types";
import { postToApi } from "../helper";

export async function addManga(manga: MangaInfo): Promise<void> {
    if (!manga) throw new Error("No manga provided");
    try {
        await postToApi("mangas", manga);
    } catch (error) {
        console.error(`Failed to add manga:`, error);
        throw error;
    }
}

export async function addSite(site: SiteInfo): Promise<void> {
    if (!site) throw new Error("No site provided");
    try {
        await postToApi("sites", site);
    } catch (error) {
        console.error(`Failed to add site:`, error);
        throw error;
    }
}

export async function addSiteToManga(site: string, manga: string): Promise<void> {
    if (!site) throw new Error("No site provided");
    if (!manga) throw new Error("No manga provided");
    try {
        await postToApi("mangas/site", { site: site, manga: manga });
    } catch (error) {
        console.error(`Failed to add site to manga:`, error);
        throw error;
    }
}
