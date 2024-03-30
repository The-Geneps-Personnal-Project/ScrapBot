export interface MangaInfo {
    sites: SiteInfo[];
    anilist_id: Number;
    alert?: boolean;
    chapter?: string;
    name: string;
}

export interface SiteInfo {
    site: string;
    url: string;
    chapter_url: string;
    selector: string;
}

export interface ScrapingResult {
    manga: MangaInfo;
    lastChapter: string;
    site: SiteInfo;
}

export interface ScrapingError {
    name: string;
    error: unknown;
    url: string;
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
