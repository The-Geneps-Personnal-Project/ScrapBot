import fs from "fs";
import { MangaInfo, ScrapingResult, SiteInfo } from "./types";

function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

function readJSONFile<T>(filePath: string): T {
    try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        return JSON.parse(fileContent) as T;
    } catch (error) {
        console.error(`Failed to read ${filePath}:`, error);
        throw error;
    }
}

export function getMangasInfo(): MangaInfo[] {
    const sitesData: {
        sites: SiteInfo[];
    } = readJSONFile("./stockage/sites.json");

    const mangasData: {
        data: Array<{
            sites: string[];
            anilist_id: string;
            name: string;
            chapter: string;
            alert: boolean;
        }>;
    } = readJSONFile("./stockage/mangas_test.json");

    const mangasInfo: MangaInfo[] = mangasData.data.map(manga => {
        const sites: SiteInfo[] = manga.sites.map(siteName => {
            const siteInfo = sitesData.sites.find(site => site.site === siteName);
            if (!siteInfo) {
                throw new Error(`SiteInfo for ${siteName} not found.`);
            }

            const modifiedSiteInfo = {
                ...siteInfo,
                url: siteInfo.url + replaceURL(manga.name),
            };

            return modifiedSiteInfo;
        });

        return {
            sites,
            anilist_id: Number(manga.anilist_id),
            name: manga.name,
            chapter: manga.chapter,
            alert: manga.alert,
        };
    });

    return mangasInfo;
}

export function setMangasInfo(results: ScrapingResult[]): void {
    const currentMangas = getMangasInfo();

    const updatedMangas = currentMangas.map(manga => {
        const result = results.find(result => result.manga.name === manga.name);
        const updatedManga = {
            ...manga,
            sites: manga.sites.map(site => site.site),
        };
        if (result) updatedManga.chapter = result.lastChapter;
        return updatedManga;
    });
    const mangasToWrite = {
        data: updatedMangas,
    };

    try {
        fs.writeFileSync("./stockage/mangas_test.json", JSON.stringify(mangasToWrite, null, 4));
    } catch (error) {
        console.error(`Failed to write to mangas.json:`, error);
    }
}
