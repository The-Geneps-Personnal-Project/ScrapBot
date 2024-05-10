import { readDatabase, replaceURL } from "../helper";
import { MangaInfo, SiteInfo } from "../../../types/types";

export async function getSiteFromName(name: string): Promise<SiteInfo[]> {
    const site: SiteInfo[] = await readDatabase("SELECT * FROM sites WHERE site = ?", [name]);

    return site;
}

export async function getAllSites(): Promise<SiteInfo[]> {
    const sites: SiteInfo[] = await readDatabase("SELECT * FROM sites");

    return sites;
}

export async function getMangaFromName(name: string): Promise<MangaInfo[]> {
    const manga: MangaInfo[] = await readDatabase("SELECT * FROM mangas WHERE name = ?", [name]);

    return manga;
}

export async function getAllMangas(): Promise<MangaInfo[]> {
    const mangas: MangaInfo[] = await readDatabase("SELECT * FROM mangas");

    return mangas;
}

export async function getMangasInfo(): Promise<MangaInfo[]> {
    const mangas: MangaInfo[] = await readDatabase("SELECT * FROM mangas");

    const mangasInfo: MangaInfo[] = await Promise.all(
        mangas.map(async manga => {
            const sites: SiteInfo[] = await readDatabase(
                `SELECT s.* FROM sites s
            JOIN manga_sites ms ON s.id = ms.site_id
            WHERE ms.manga_id = ?`,
                [manga.id || 0]
            );

            const sitesInfo = sites.map(site => ({
                ...site,
                url: site.url + replaceURL(manga.name),
                chapter_url: site.chapter_url + replaceURL(manga.name),
            }));

            return {
                id: manga.id,
                sites: sitesInfo,
                anilist_id: manga.anilist_id,
                name: manga.name,
                chapter: manga.chapter,
                alert: manga.alert,
            };
        })
    );

    return mangasInfo;
}
