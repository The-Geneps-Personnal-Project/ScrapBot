import { MangaInfo, ScrapingResult, SiteInfo } from "./types";
import db from "sqlite3";
import {Database, open} from "sqlite";

function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

async function openDatabase(): Promise<Database> {
    return await open({
        filename: `${process.cwd()}/stockage/database.sqlite3`,
        driver: db.Database,
    });
}

async function readDatabase<T>(sql: string, params?: any[]): Promise<T> {
    const database = await openDatabase();
    try {
        const result = await database.all(sql, params);
        return result as unknown as T;
    } catch (error) {
        console.error('Failed to execute query:', error);
        throw error;
    } finally {
        await database.close();
    }
}

export async function getMangasInfo(): Promise<MangaInfo[]> {
    const mangas: MangaInfo[] = 
      await readDatabase('SELECT * FROM mangas');

    const mangasInfo: MangaInfo[] = await Promise.all(mangas.map(async (manga) => {
        const sites: SiteInfo[] = await readDatabase(
            `SELECT s.* FROM sites s
            JOIN manga_sites ms ON s.id = ms.site_id
            WHERE ms.manga_id = ?`,
            [manga.id]
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
    }));

    return mangasInfo;
}

export async function setMangasInfo(results: ScrapingResult[]): Promise<void> {
    const db = await openDatabase();

    await db.exec('BEGIN TRANSACTION');
    try {
        for (const result of results) {
            await db.run('UPDATE mangas SET chapter = ? WHERE name = ?', result.lastChapter, result.manga.name);
        }
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to update mangas:`, error);
        throw error;
    }
    db.close();
}
