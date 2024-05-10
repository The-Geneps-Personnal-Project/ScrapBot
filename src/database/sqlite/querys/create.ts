import { openDatabase } from "../helper";
import { MangaInfo, SiteInfo } from "../../../types/types";

export async function addManga(manga: MangaInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec("BEGIN TRANSACTION");
        const { lastID } = await db.run(
            "INSERT INTO mangas (anilist_id, name, chapter, alert) VALUES (?, ?, ?, ?)",
            manga.anilist_id,
            manga.name,
            manga.chapter,
            true
        );

        for (const site of manga.sites) {
            await db.run("INSERT INTO manga_sites (manga_id, site_id) VALUES (?, ?)", lastID, site.id);
        }

        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to add manga:`, error);
        throw error;
    }
    db.close();
}

export async function addSite(site: SiteInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec("BEGIN TRANSACTION");
        await db.run(
            "INSERT INTO sites (site, url, chapter_url, chapter_limiter) VALUES (?, ?, ?, ?)",
            site.site,
            site.url,
            site.chapter_url,
            site.chapter_limiter
        );

        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to add site:`, error);
        throw error;
    }
    db.close();
}

export async function addSiteToManga(site: SiteInfo, manga: MangaInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec("BEGIN TRANSACTION");
        await db.run("INSERT INTO manga_sites (manga_id, site_id) VALUES (?, ?)", manga.id, site.id);

        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to add site to manga:`, error);
        throw error;
    }
    db.close();
}