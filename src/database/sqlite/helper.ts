import db from "sqlite3";
import { Database, open } from "sqlite";

export function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

export async function openDatabase(): Promise<Database> {
    return await open({
        filename: `${process.cwd()}/stockage/${process.env.DB_NAME}`,
        driver: db.Database,
    });
}

export async function readDatabase<T>(sql: string, params?: Number[] | string[]): Promise<T> {
    const database = await openDatabase();
    try {
        const result = await database.all(sql, params);
        return result as T;
    } catch (error) {
        console.error("Failed to execute query:", error);
        throw error;
    } finally {
        await database.close();
    }
}