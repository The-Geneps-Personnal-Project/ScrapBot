import { MangaInfo, SiteInfo } from "../../types/types";
import { fetchFromApi } from "../helper";

export async function getSiteFromName(name: string): Promise<SiteInfo[]> {
    if (!name) throw new Error("No name provided");
    try {
        const site: SiteInfo[] = await fetchFromApi("site", { site: name });

        return site;
    } catch {
        throw new Error("Site does not exist");
    }
}

export async function getAllSites(): Promise<SiteInfo[]> {
    try {
        const sites: SiteInfo[] = await fetchFromApi("site");

        return sites;
    } catch (error) {
        console.error(`Failed to get all sites:`, error);
        throw error;
    }
}

export async function getMangaFromName(name: string): Promise<MangaInfo[]> {
    if (!name) throw new Error("No name provided");
    try {
        const manga: MangaInfo[] = await fetchFromApi("manga", { name });

        return manga;
    } catch {
        throw new Error("Manga does not exist");
    }
}

export async function getAllMangas(): Promise<MangaInfo[]> {
    try {
        const mangas: MangaInfo[] = await fetchFromApi("manga");

        return mangas;
    } catch {
        throw new Error("Failed to get all mangas");
    }
}
