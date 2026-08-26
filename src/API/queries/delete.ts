import { deleteFromApi } from "../helper";
import { invalidateCache } from "../cache";

export async function removeSite(site: string): Promise<void> {
    if (!site) throw new Error("No site provided");
    await deleteFromApi("sites", { name: site });
    invalidateCache();
}

export async function removeSiteFromManga(site: string, manga: string): Promise<void> {
    if (!site) throw new Error("No site provided");
    if (!manga) throw new Error("No manga provided");
    await deleteFromApi("mangas/site", { manga, site });
    invalidateCache();
}

export async function removeManga(name: string): Promise<void> {
    if (!name) throw new Error("No name provided");
    await deleteFromApi("mangas", { name });
    invalidateCache();
}
