import { MangaInfo, SiteInfo } from "../../types/types";
import { postToApi } from "../helper";
import { invalidateCache } from "../cache";

export async function addManga(manga: MangaInfo): Promise<void> {
    if (!manga?.name) throw new Error("No manga provided");
    await postToApi("mangas", manga);
    invalidateCache();
}

export async function addSite(site: SiteInfo): Promise<void> {
    if (!site?.site || !site.url) throw new Error("No site provided");
    await postToApi("sites", site);
    invalidateCache();
}

export async function addSiteToManga(site: string, manga: string): Promise<void> {
    if (!site) throw new Error("No site provided");
    if (!manga) throw new Error("No manga provided");
    await postToApi("mangas/site", { site, manga });
    invalidateCache();
}
