import { MangaInfo, SiteInfo } from "../types/types";
import { getAllMangas, getAllSites } from "./queries/get";

/**
 * Discord gives autocomplete handlers 3 seconds to respond and fires one per
 * keystroke. Hitting ScrapAPI on every character both blows that budget on a
 * Raspberry Pi and hammers the API, so results are cached briefly.
 *
 * 30s is short enough that a manga added through /create shows up almost
 * immediately even if a mutation forgets to invalidate.
 */
const TTL_MS = 30_000;

interface Entry<T> {
    fetchedAt: number;
    value: T;
}

let mangaEntry: Entry<MangaInfo[]> | null = null;
let siteEntry: Entry<SiteInfo[]> | null = null;

// In-flight promises are shared so a burst of keystrokes triggers one request, not N.
let mangaInFlight: Promise<MangaInfo[]> | null = null;
let siteInFlight: Promise<SiteInfo[]> | null = null;

const isFresh = <T>(entry: Entry<T> | null): entry is Entry<T> =>
    entry !== null && Date.now() - entry.fetchedAt < TTL_MS;

export async function getCachedMangas(): Promise<MangaInfo[]> {
    if (isFresh(mangaEntry)) return mangaEntry.value;
    if (mangaInFlight) return mangaInFlight;

    mangaInFlight = getAllMangas()
        .then(value => {
            mangaEntry = { fetchedAt: Date.now(), value };
            return value;
        })
        .finally(() => {
            mangaInFlight = null;
        });

    return mangaInFlight;
}

export async function getCachedSites(): Promise<SiteInfo[]> {
    if (isFresh(siteEntry)) return siteEntry.value;
    if (siteInFlight) return siteInFlight;

    siteInFlight = getAllSites()
        .then(value => {
            siteEntry = { fetchedAt: Date.now(), value };
            return value;
        })
        .finally(() => {
            siteInFlight = null;
        });

    return siteInFlight;
}

/** Call after any mutation so autocomplete reflects the change immediately. */
export function invalidateCache(): void {
    mangaEntry = null;
    siteEntry = null;
}
