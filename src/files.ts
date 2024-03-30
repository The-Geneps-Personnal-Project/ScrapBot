import fs from "fs";
import { MangaInfo, ScrapingResult, SiteInfo } from "./types";

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
    const sitesData: SiteInfo[] = readJSONFile<SiteInfo[]>('sites.json');
    const mangasData: Array<{
        sites: string[];
        anilist_id: string;
        name: string;
        chapter: string;
        alert: boolean;
    }> = readJSONFile('mangas.json');

    const mangasInfo: MangaInfo[] = mangasData.map(manga => {
        const sites: SiteInfo[] = manga.sites.map(siteName => {
            const siteInfo = sitesData.find(site => site.site === siteName);
            if (!siteInfo) {
                throw new Error(`SiteInfo for ${siteName} not found.`);
            }
            return siteInfo;
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
        if (result) {
            return {
                ...manga,
                chapter: result.lastChapter
            };
        } else {
            return manga;
        }
    });

    try {
        fs.writeFileSync("sites.json", JSON.stringify(updatedMangas, null, 2));
    } catch (error) {
        console.error(`Failed to write to sites.json:`, error);
    }
}