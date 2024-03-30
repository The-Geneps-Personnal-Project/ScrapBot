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
    const sitesDataContainer: {
        sites: SiteInfo[];
    } = readJSONFile("./stockage/sites.json");
    const sitesData = sitesDataContainer.sites;
    const mangasData: {
        data: Array<{
            sites: string[];
            anilist_id: string;
            name: string;
            chapter: string;
            alert: boolean;
        }>;
    } = readJSONFile("./stockage/mangas.json");

    const mangasInfo: MangaInfo[] = mangasData.data.map(manga => {
        const sites: SiteInfo[] = manga.sites.map(siteName => {
            let siteInfo = sitesData.find(site => site.site === siteName);
            if (!siteInfo) {
                throw new Error(`SiteInfo for ${siteName} not found.`);
            }
            siteInfo.url = siteInfo?.url + manga.name.replace(/ /g, "-").toLowerCase();
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
            const simplifiedSites = manga.sites.map(site => site.site);
            return {
                ...manga,
                chapter: result.lastChapter,
                sites: simplifiedSites,
            };
        } else {
            return manga;
        }
    });
    const mangasToWrite = {
        data: updatedMangas,
    };

    try {
        fs.writeFileSync("./stockage/mangas.json", JSON.stringify(mangasToWrite, null, 2));
    } catch (error) {
        console.error(`Failed to write to mangas.json:`, error);
    }
}
