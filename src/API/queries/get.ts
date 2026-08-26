import { MangaInfo, SiteInfo } from "../../types/types";
import { ApiError, getFromApi } from "../helper";

/**
 * Returns null when the resource does not exist, and only throws on a real failure.
 *
 * The old helpers turned *every* error into `throw new Error("... does not exist")`,
 * which inverted every caller's existence check: creating a genuinely new site
 * aborted with "Site does not exist", while an existing one sailed through.
 *
 * The empty-body case is tolerated because older ScrapAPI builds answered a missing
 * resource with 200 and no payload rather than a 404.
 */
async function getOrNull<T>(endpoint: string): Promise<T | null> {
    try {
        const value = await getFromApi<T>(endpoint);
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "object" && Object.keys(value as object).length === 0) return null;
        return value;
    } catch (error) {
        if (error instanceof ApiError && error.isNotFound) return null;
        throw error;
    }
}

export async function getSiteFromName(name: string): Promise<SiteInfo | null> {
    if (!name) throw new Error("No name provided");
    return getOrNull<SiteInfo>(`sites/${encodeURIComponent(name)}`);
}

export async function getMangaFromName(name: string): Promise<MangaInfo | null> {
    if (!name) throw new Error("No name provided");
    return getOrNull<MangaInfo>(`mangas/${encodeURIComponent(name)}`);
}

export async function getAllSites(): Promise<SiteInfo[]> {
    const sites = await getFromApi<SiteInfo[]>("sites");
    return Array.isArray(sites) ? sites : [];
}

export async function getAllMangas(): Promise<MangaInfo[]> {
    const mangas = await getFromApi<MangaInfo[]>("mangas");
    return Array.isArray(mangas) ? mangas : [];
}
