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

async function readDatabase<T>(sql: string, params?: Number[] | string[]): Promise<T> {
    const database = await openDatabase();
    try {
        const result = await database.all(sql, params);
        return result as T;
    } catch (error) {
        console.error('Failed to execute query:', error);
        throw error;
    } finally {
        await database.close();
    }
}

export async function getSiteFromName(name: string): Promise<SiteInfo[]> {
    const site: SiteInfo[] = 
      await readDatabase('SELECT * FROM sites WHERE site = ?', [name]);

    return site;
}

export async function getMangaFromName(name: string): Promise<MangaInfo[]> {
    const manga: MangaInfo[] = 
      await readDatabase('SELECT * FROM mangas WHERE name = ?', [name]);

    return manga;
}

export async function getMangasInfo(): Promise<MangaInfo[]> {
    const mangas: MangaInfo[] = 
      await readDatabase('SELECT * FROM mangas');

    const mangasInfo: MangaInfo[] = await Promise.all(mangas.map(async (manga) => {
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

export async function addManga(manga: MangaInfo): Promise<void> {
    const db = await openDatabase();
    
    try {
        await db.exec('BEGIN TRANSACTION');
        const { lastID } = await db.run(
            'INSERT INTO mangas (anilist_id, name, chapter, alert) VALUES (?, ?, ?, ?)',
            manga.anilist_id,
            manga.name,
            manga.chapter,
            true
        );

        for (const site of manga.sites) {
            await db.run(
                'INSERT INTO manga_sites (manga_id, site_id) VALUES (?, ?)',
                lastID,
                site.id
            );
        }

        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to add manga:`, error);
        throw error;
    }
    db.close();
}

export async function addSite(site: SiteInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec('BEGIN TRANSACTION');
        await db.run(
            'INSERT INTO sites (site, url, chapter_url, chapter_limiter) VALUES (?, ?, ?, ?)',
            site.site,
            site.url,
            site.chapter_url,
            site.chapter_limiter
        );

        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to add site:`, error);
        throw error;
    }
    db.close();
}

export async function removeManga(name: string): Promise<void> {
    const db = await openDatabase();

    const manga = await getMangaFromName(name);

    try {
        await db.exec('BEGIN TRANSACTION');
        await db.run('DELETE FROM mangas WHERE name = ?', manga[0].name);
        await db.run('DELETE FROM manga_sites WHERE manga_id = ?', manga[0].id);
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to remove manga:`, error);
        throw error;
    }
    db.close();
}

export async function removeSite(site: string): Promise<void> {
    const db = await openDatabase();

    const s = await getSiteFromName(site);

    await db.exec('BEGIN TRANSACTION');
    try {
        await db.run('DELETE FROM sites WHERE site = ?', s[0].site);
        await db.run('DELETE FROM manga_sites WHERE site_id = ?', s[0].id)
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to remove site:`, error);
        throw error;
    }
    db.close();
}

export async function removeSiteFromManga(site: SiteInfo, manga: MangaInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec('BEGIN TRANSACTION');
        await db.run('DELETE FROM manga_sites WHERE manga_id = ? AND site_id = ?', manga.id, site.id);
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to remove site from manga:`, error);
        throw error;
    } finally {
        db.close();
    }
}

export async function addSiteToManga(site: SiteInfo, manga: MangaInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec('BEGIN TRANSACTION');
        await db.run(
            'INSERT INTO manga_sites (manga_id, site_id) VALUES (?, ?)',
            manga.id,
            site.id
        );

        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error(`Failed to add site to manga:`, error);
        throw error;
    }
    db.close();
}