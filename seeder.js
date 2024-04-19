const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const mangaJsonPath = './stockage/mangas.json';
const sitesJsonPath = './stockage/sites.json';
const databasePath = './stockage/database.sqlite3';

async function setupDatabase() {
    const db = await open({
        filename: databasePath,
        driver: sqlite3.Database,
    });

    const mangaData = JSON.parse(fs.readFileSync(mangaJsonPath, 'utf8'));
    const siteData = JSON.parse(fs.readFileSync(sitesJsonPath, 'utf8'));

    await db.exec('BEGIN TRANSACTION');

    try {
        for (const site of siteData.sites) {
            const { site: siteName, url, chapter_url, chapter_limiter, selector } = site;
            await db.run(`
                INSERT INTO sites (site, url, chapter_url, chapter_limiter, selector)
                VALUES (?, ?, ?, ?, ?)`,
                siteName, url, chapter_url, chapter_limiter, selector
            );
        }

        await db.exec('COMMIT');

        for (const manga of mangaData.data) {
            const { anilist_id, name, chapter, alert, sites: mangaSites } = manga;
            
            const { lastID: mangaId } = await db.run(`
                INSERT INTO mangas (anilist_id, name, chapter, alert)
                VALUES (?, ?, ?, ?)`,
                anilist_id, name, chapter, alert ? 1 : 0
            );
            
            for (const siteName of mangaSites) {
                const site = await db.get(`SELECT id FROM sites WHERE site = ?`, siteName);
                if (site) {
                await db.run(`
                    INSERT INTO manga_sites (manga_id, site_id)
                    VALUES (?, ?)`,
                    mangaId, site.id
                );
                }
            }
        }

        await db.exec('COMMIT');
    } catch (error) {
        console.error('Failed to populate the database:', error);
        await db.exec('ROLLBACK');
    }

    await db.close();
}

setupDatabase();
