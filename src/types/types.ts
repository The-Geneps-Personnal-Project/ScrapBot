import { Worker } from 'worker_threads';
export interface MangaInfo {
    id?: Number;
    sites: SiteInfo[];
    anilist_id: Number;
    alert?: Number;
    chapter: string;
    name: string;
    last_update?: string;
    infos?: GraphqlQueryMediaOutput;
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
    url: string;
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
    id?: number;
    mediaId?: number;
    progress?: number;
}

export interface GraphqlQueryMediaOutput {
    tags: { name: string }[];
    description: string;
    coverImage: string;
}

export interface WorkerData {
    manga: MangaInfo;
}

export interface CustomWorker {
    worker: Worker;
    status: boolean;
}

export type ScrapingOutcome = [ScrapingResult[], ScrapingError[]];

export type linkResult = [number, string[]];
