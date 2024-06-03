import { deleteFromApi } from "../helper";

export async function removeSite(site: string): Promise<void> {
    try {
        await deleteFromApi("sites", { name: site });
    } catch (error) {
        console.error(`Failed to remove site:`, error);
        throw error;
    }
}

export async function removeSiteFromManga(site: string, manga: string): Promise<void> {
    if (!site) throw new Error("No site provided");
    if (!manga) throw new Error("No manga provided");
    try {
        await deleteFromApi("mangas/site", { manga: manga, site: site });
    } catch (error) {
        console.error(`Failed to remove site from manga:`, error);
        throw error;
    }
}

export async function removeManga(name: string): Promise<void> {
    if (!name) throw new Error("No name provided");
    try {
        await deleteFromApi("mangas", { name });
    } catch (error) {
        console.error(`Failed to remove manga:`, error);
        throw error;
    }
}
