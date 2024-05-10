import { openDatabase } from "../helper";
import { MangaInfo, ScrapingResult, SiteInfo } from "../../../types/types";

export async function setMangasInfo(results: ScrapingResult[]): Promise<void> {
    const db = await openDatabase();

    await db.exec("BEGIN TRANSACTION");
    try {
        for (const result of results) {
            await db.run("UPDATE mangas SET chapter = ? WHERE name = ?", result.lastChapter, result.manga.name);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to update mangas:`, error);
        throw error;
    }
    db.close();
}

export async function updateSiteInfo(site: SiteInfo): Promise<void> {
    const db = await openDatabase();

    db.exec("BEGIN TRANSACTION");
    try {
        db.run(
            "UPDATE sites SET url = ?, chapter_limiter = ?, chapter_url = ? WHERE id = ?",
            site.url,
            site.chapter_limiter,
            site.chapter_url,
            site.id
        );
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        console.error(`Failed to add site:`, error);
        throw error;
    }
    db.close();
}

export async function updateMangaInfo(manga: MangaInfo): Promise<void> {
    const db = await openDatabase();

    db.exec("BEGIN TRANSACTION");
    try {
        db.run(
            "UPDATE mangas SET chapter = ?, alert = ? WHERE id = ?",
            manga.chapter,
            manga.alert,
            manga.id
        );
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        console.error(`Failed to update manga:`, error);
        throw error;
    }
    db.close();
}