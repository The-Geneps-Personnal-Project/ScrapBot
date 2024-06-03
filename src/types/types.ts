export interface MangaInfo {
    id?: Number;
    sites: SiteInfo[];
    anilist_id: Number;
    alert?: Number;
    chapter: string;
    name: string;
}

export interface SiteInfo {
    id?: number;
    site: string;
    url: string;
    chapter_url: string;
    chapter_limiter: string;
}

export interface ScrapingResult {
    manga: MangaInfo;
    lastChapter: string;
    site: SiteInfo;
}

export interface ScrapingError {
    name: string;
    error: unknown;
}

export interface GraphqlQuery {
    query: string;
    variables: GraphqlParams;
}

export interface GraphqlParams {
    mediaId: number;
    progress: number;
}

export type ScrapingOutcome = [ScrapingResult[], ScrapingError[]];
