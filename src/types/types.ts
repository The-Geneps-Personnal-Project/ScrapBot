/**
 * 'active' takes part in scraping and raises alerts.
 * 'must_watch' is a backlog entry: same table, no alerts, never scraped.
 */
export type MangaStatus = "active" | "must_watch";

export interface MangaInfo {
    id?: number;
    sites: SiteInfo[];
    anilist_id: number;
    alert?: number;
    chapter: string;
    name: string;
    last_update?: string;
    status?: MangaStatus;
    infos?: MangaExtraInfo;
}

export interface SiteInfo {
    id?: number;
    site: string;
    url: string;
    chapter_url: string;
    chapter_limiter: string;
}

/**
 * Enrichment pulled from AniList and persisted by ScrapAPI.
 *
 * `coverImage` is a plain URL string. AniList returns `coverImage { medium }` as an
 * object, so the GraphQL layer flattens it at the boundary — that way this type
 * matches both what the API stores (a TEXT column) and what it returns.
 */
export interface MangaExtraInfo {
    tags: { name: string }[];
    description: string;
    coverImage: string;
}

export interface ScrapingResult {
    manga: MangaInfo;
    /** Highest chapter available across every site — what progress is synced to. */
    lastChapter: string;
    /** First unread chapter. When 506..510 drop at once this is 506, not 510. */
    nextChapter: string;
    /** The site `url` points at, i.e. the one hosting `nextChapter`. */
    site: SiteInfo;
    /** Link to `nextChapter` — the chapter the reader should open first. */
    url: string;
}

export interface ScrapingError {
    name: string;
    error: string;
}

export interface GraphqlQuery {
    query: string;
    variables: GraphqlParams;
}

export interface GraphqlParams {
    id?: number;
    mediaId?: number;
    progress?: number;
    /** AniList MediaListStatus, e.g. PLANNING or CURRENT. */
    status?: string;
}

/** Messages a scraping worker may send back to the pool. */
export type WorkerMessage =
    | { type: "result"; data: ScrapingResult }
    | { type: "error"; data: ScrapingError }
    | { type: "empty" };

export interface WorkerTask {
    manga: MangaInfo;
}

/**
 * One chapter update recorded during the day.
 *
 * Kept as structured data rather than read back from the notification messages:
 * those are Components V2 containers, which carry no `content` at all — which is
 * exactly why archiving them stopped capturing anything.
 */
export interface DailyUpdate {
    name: string;
    /** Chapter the reader was on before this update. */
    from: string;
    /** Highest chapter available. */
    to: string;
    /** First unread chapter — what the link points at. */
    next: string;
    url: string;
    site: string;
    at: string;
}

export type ScrapingOutcome = [ScrapingResult[], ScrapingError[]];

export type linkResult = [number, string[], ScrapingError[]];
