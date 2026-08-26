import { JSDOM } from "jsdom";

/**
 * Most manga aggregators sit behind Cloudflare or a similar WAF and answer a bare
 * Node fetch with 403/503. A browser-shaped UA and Accept set is the minimum
 * needed to get a response at all.
 */
const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

/**
 * 20s: comfortably above the p99 of a healthy manga site, low enough that a dead
 * host cannot occupy a scraping worker for a meaningful slice of a run.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

export interface FetchedPage {
    document: Document;
    /** URL after redirects. JSDOM cannot report this on its own — see `redirected`. */
    finalUrl: string;
    redirected: boolean;
}

export class FetchError extends Error {
    constructor(
        readonly url: string,
        readonly status: number | null,
        message: string
    ) {
        super(message);
        this.name = "FetchError";
    }
}

async function fetchHtml(
    url: string,
    timeoutMs: number
): Promise<{ html: string; finalUrl: string; redirected: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            headers: BROWSER_HEADERS,
            redirect: "follow",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new FetchError(url, response.status, `Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }

        return {
            html: await response.text(),
            finalUrl: response.url || url,
            redirected: response.redirected,
        };
    } catch (error) {
        if (error instanceof FetchError) throw error;
        if ((error as Error).name === "AbortError") {
            throw new FetchError(url, null, `Timed out after ${timeoutMs}ms fetching ${url}`);
        }
        throw new FetchError(url, null, `Failed to fetch ${url}: ${(error as Error).message}`);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Runs `fn` against a parsed DOM and always tears the JSDOM window down afterwards.
 *
 * The callback shape is deliberate: closing the window invalidates the Document,
 * so a function that merely *returned* the Document could never dispose of it.
 * Every window left open retains a full DOM graph plus its internal timers, which
 * is how the scraping workers used to grow without bound.
 */
export async function withSiteDOM<T>(
    url: string,
    fn: (page: FetchedPage) => Promise<T> | T,
    options: { timeoutMs?: number } = {}
): Promise<T> {
    const { html, finalUrl, redirected } = await fetchHtml(url, options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
    return withHtmlDOM(html, finalUrl, redirected, fn);
}

/** Same disposal contract as {@link withSiteDOM}, for HTML obtained elsewhere (e.g. a browser render). */
export async function withHtmlDOM<T>(
    html: string,
    finalUrl: string,
    redirected: boolean,
    fn: (page: FetchedPage) => Promise<T> | T
): Promise<T> {
    const dom = new JSDOM(html, { url: finalUrl });
    try {
        return await fn({
            document: dom.window.document,
            finalUrl,
            redirected,
        });
    } finally {
        dom.window.close();
    }
}
