import { FetchedPage } from "./fetch";

export function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

const ERROR_TITLE_MARKERS = ["404", "not found", "page not found", "error", "sorry"];

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "").toLowerCase();

/**
 * A manga page is "valid" when the site actually served the URL we asked for.
 *
 * The previous implementation compared `document.location.href` against the
 * request URL, but JSDOM sets location from the URL it was constructed with — it
 * could never differ, so the check was a no-op. Redirect detection now comes from
 * the HTTP response itself (see `FetchedPage.finalUrl`).
 */
export function isValidPage(page: FetchedPage, expectedUrl: string): boolean {
    if (stripTrailingSlash(page.finalUrl) !== stripTrailingSlash(expectedUrl)) return false;

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
