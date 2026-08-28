import { FetchedPage } from "./fetch";

export function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

const ERROR_TITLE_MARKERS = ["404", "not found", "page not found", "error", "sorry"];

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "").toLowerCase();

/** Host without `www.`, and path without a trailing slash — for comparing two URLs. */
function locate(url: string): { host: string; path: string } {
    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname.replace(/^www\./i, "").toLowerCase(),
            path: stripTrailingSlash(parsed.pathname),
        };
    } catch {
        return { host: "", path: stripTrailingSlash(url) };
    }
}

/**
 * Is this page actually the manga we asked for?
 *
 * Redirects are normal — canonical trailing slashes, https upgrades, www, slug
 * rewrites — so this compares loosely. Only two things disqualify a page: landing on
 * a different host, or being bounced to the site root, which is how sites say "no such
 * manga".
 *
 * The original check compared `document.location.href`, which JSDOM sets from the URL
 * it was constructed with, so it could never differ and never rejected anything.
 * Replacing it with strict equality then went too far the other way and rejected every
 * redirecting site.
 */
export function isValidPage(page: FetchedPage, expectedUrl: string): boolean {
    const got = locate(page.finalUrl);
    const want = locate(expectedUrl);

    if (got.host !== want.host) return false;

    // Bounced to the root while we asked for a deeper path: the manga is not here.
    if (want.path !== "" && got.path === "") return false;

    if (got.path !== want.path) {
        // A rewritten path is fine as long as it still carries the slug we asked for.
        const slug = want.path.split("/").filter(Boolean).at(-1) ?? "";
        if (!slug || !got.path.includes(slug)) return false;
    }

    const pageTitle = page.document.title.toLowerCase();
    return !ERROR_TITLE_MARKERS.some(marker => pageTitle.includes(marker));
}

export function isStringSimilarity(choiceText: string, input: string): number {
    if (input === "") return 1;
    const tokens = input
        .toLowerCase()
        .split(/\s+/)
        .filter(token => token.length > 0);
    const matches = tokens.filter(token => choiceText.includes(token)).length;
    return matches / tokens.length;
}

/**
 * Runs `task` over `items` with at most `limit` in flight, preserving input order
 * in the result. Used to keep site-linking from firing one request per site
 * sequentially without letting it turn into an unbounded fan-out either.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) return [];

    const results = new Array<R>(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await task(items[index], index);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Coerces a possibly-null database field to a string.
 *
 * The production `sites` table lost its NOT NULL constraints during an earlier
 * hand-run migration, so rows with a null `site` or `url` do exist and reach the
 * rendering layer.
 */
export function text(value: string | null | undefined, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** Truncates to `max` characters, appending an ellipsis when it had to cut. */
export function truncate(value: string | null | undefined, max: number): string {
    const source = text(value);
    if (source.length <= max) return source;
    return source.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** Locale-aware comparison that tolerates null fields, sorting them last. */
export function compareNames(a: string | null | undefined, b: string | null | undefined): number {
    const left = text(a);
    const right = text(b);
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return left.localeCompare(right, "fr", { sensitivity: "base" });
}
