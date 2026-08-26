import axios, { AxiosError, AxiosResponse } from "axios";

import { GraphqlQuery, MangaExtraInfo, ScrapingResult } from "../../types/types";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

/**
 * AniList advertises `x-ratelimit-limit: 30` (requests per minute) and sits behind
 * Cloudflare. Bursting past that quota does not merely earn a 429 — sustained abuse
 * gets the source IP blocked at the edge, which surfaces as a bare **403** before the
 * request ever reaches the GraphQL layer. That is the origin of the 403 seen on
 * /create manga; an absent or invalid token yields 400 "Invalid token" instead, and
 * an unauthenticated mutation yields 401.
 *
 * ~2.1s between calls keeps us near 28 req/min, comfortably under the cap.
 */
const MIN_INTERVAL_MS = 2_100;

/** AniList asks API consumers to identify themselves; a bare `axios/1.x` scores poorly with Cloudflare. */
const USER_AGENT = "ScrapBot/1.0 (+https://github.com/The-Geneps-Personnal-Project/ScrapTS)";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

const mutationQuery = `
mutation ($mediaId: Int, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress) {
        mediaId
    }
}
`;

const mangaQuery = `
query ($id: Int){
    Media(id: $id) {
      tags {
        name
      },
      description,
      coverImage {
            medium
      }
    }
  }
`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Serialises every AniList call through a single chain, so concurrent callers queue
// instead of bursting. This is the single choke point for the whole process.
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
        const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
        return task();
    });

    // Keep the chain alive even when a task rejects.
    queue = run.catch(() => undefined);
    return run;
}

interface GraphqlResponse<T> {
    data?: T | null;
    errors?: { message: string; status?: number }[];
}

async function anilistRequest<T>(body: GraphqlQuery, token?: string): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
    };

    // Only ever attach the header when a token actually exists. Sending
    // `Bearer undefined` turns an optional credential into a guaranteed 400.
    if (token) headers.Authorization = `Bearer ${token}`;

    let attempt = 0;

    for (;;) {
        attempt++;

        try {
            const response: AxiosResponse<GraphqlResponse<T>> = await schedule(() =>
                axios.post(ANILIST_ENDPOINT, JSON.stringify(body), { headers, timeout: REQUEST_TIMEOUT_MS })
            );

            // A GraphQL-level failure arrives as HTTP 200 with `data: null`.
            // Dereferencing `.data.Media` without this check throws a TypeError.
            if (response.data?.errors?.length) {
                throw new Error(`AniList error: ${response.data.errors.map(e => e.message).join("; ")}`);
            }
            if (!response.data?.data) {
                throw new Error("AniList returned an empty payload.");
            }

            return response.data.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            const status = axiosError.response?.status;
            const throttled = status === 429 || status === 403;

            if (!throttled || attempt >= MAX_RETRIES) {
                if (throttled) {
                    throw new Error(
                        `AniList refused the request with ${status} after ${attempt} attempts. ` +
                            `This is rate limiting at the Cloudflare edge, not a bad token — back off and retry later.`
                    );
                }
                throw error;
            }

            const retryAfter = Number(axiosError.response?.headers?.["retry-after"]);
            const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 5_000;

            console.warn(`AniList responded ${status}; retrying in ${Math.round(backoff / 1000)}s (attempt ${attempt}/${MAX_RETRIES}).`);
            await sleep(backoff);
        }
    }
}

/**
 * Fetches tags / description / cover for a media id.
 *
 * Returns null instead of throwing when AniList is unavailable: this enrichment is
 * decorative, and failing it should never abort manga creation.
 */
export async function getMangaInfos(id: number): Promise<MangaExtraInfo | null> {
    if (!id || id === 0) return null;

    try {
        // Deliberately unauthenticated: the public Media query answers 200 with no
        // Authorization header, so sending a token here can only introduce failures.
        const data = await anilistRequest<{
            Media: { tags: { name: string }[]; description: string; coverImage: { medium: string } } | null;
        }>({ query: mangaQuery, variables: { id } });

        if (!data.Media) return null;

        return {
            tags: data.Media.tags ?? [],
            description: data.Media.description ?? "",
            // Flattened here so the rest of the codebase sees a plain URL string,
            // matching what ScrapAPI stores and returns.
            coverImage: data.Media.coverImage?.medium ?? "",
        };
    } catch (error) {
        console.error(`Failed to fetch AniList infos for ${id}: ${(error as Error).message}`);
        return null;
    }
}

/** Pushes read progress back to the user's AniList list. Requires a token. */
export async function updateList(results: ScrapingResult[]): Promise<void> {
    const token = process.env.ANILIST_TOKEN;

    if (!token) {
        console.warn("ANILIST_TOKEN is not set — skipping AniList progress sync.");
        return;
    }

    for (const { manga, lastChapter } of results) {
        const progress = parseInt(lastChapter, 10);
        const mediaId = manga.anilist_id;

        if (isNaN(progress) || !mediaId) continue;

        try {
            await anilistRequest({ query: mutationQuery, variables: { mediaId, progress } }, token);
        } catch (error) {
            console.error(`Failed to sync ${manga.name} to AniList: ${(error as Error).message}`);
        }
    }
}
