import { openDatabase } from "../helper";
import { ScrapingResult } from "../../../types/types";

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
