import { openDatabase } from "../helper";
import { getMangaFromName, getSiteFromName } from "./get";
import { SiteInfo, MangaInfo } from "../../../types/types";

export async function removeSite(site: string): Promise<void> {
    const db = await openDatabase();

    const s = await getSiteFromName(site);

    await db.exec("BEGIN TRANSACTION");
    try {
        await db.run("DELETE FROM sites WHERE site = ?", s[0].site);
        await db.run("DELETE FROM manga_sites WHERE site_id = ?", s[0].id);
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to remove site:`, error);
        throw error;
    }
    db.close();
}

export async function removeSiteFromManga(site: SiteInfo, manga: MangaInfo): Promise<void> {
    const db = await openDatabase();

    try {
        await db.exec("BEGIN TRANSACTION");
        await db.run("DELETE FROM manga_sites WHERE manga_id = ? AND site_id = ?", manga.id, site.id);
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to remove site from manga:`, error);
        throw error;
    } finally {
        db.close();
    }
}

export async function removeManga(name: string): Promise<void> {
    const db = await openDatabase();

    const manga = await getMangaFromName(name);

    try {
        await db.exec("BEGIN TRANSACTION");
        await db.run("DELETE FROM mangas WHERE name = ?", manga[0].name);
        await db.run("DELETE FROM manga_sites WHERE manga_id = ?", manga[0].id);
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error(`Failed to remove manga:`, error);
        throw error;
    }
    db.close();
}
