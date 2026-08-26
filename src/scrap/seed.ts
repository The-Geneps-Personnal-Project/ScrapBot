import { MangaInfo, SiteInfo } from "../types/types";
import { withSiteDOM, withHtmlDOM } from "../utils/fetch";
import { renderPage, BrowserUnavailableError } from "../utils/browser";

export class SiteParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SiteParseError";
    }
}

/**
 * @description Get the chapter limiter from the url
 */
function getChapterLimiter(url: string): string {
    const index = url.indexOf("chapter");

    if (index === -1) return "";

    const before = index > 0 ? url.charAt(index - 1) : "";
    const after = index + "chapter".length < url.length ? url.charAt(index + "chapter".length) : "";

    return before + "chapter" + after;
}

/**
 * @description Normalize the URL by removing the last parts
 * @param toRemove - Number of path segments to strip from the end
 */
function normalizeURL(url: string, toRemove: number = 1): string {
    let normalized_url = url.endsWith("/") ? url.slice(0, -1) : url;

    const chapterIndex = normalized_url.indexOf("chapter");
    if (chapterIndex > 0 && normalized_url[chapterIndex - 1] === "-") {
        normalized_url = normalized_url.slice(0, chapterIndex - 1) + "/" + normalized_url.slice(chapterIndex);
    }

    try {
        const parsedUrl = new URL(normalized_url);

        const pathParts = parsedUrl.pathname.split("/").filter(part => part);
        toRemove = Math.min(toRemove, pathParts.length);
        const updatedPathParts = pathParts.slice(0, pathParts.length - toRemove);

        parsedUrl.pathname = "/" + updatedPathParts.join("/");

        let finalUrl = parsedUrl.toString().replace(/([^:]\/)\/+/g, "$1");
        finalUrl =
            finalUrl.endsWith("/") && updatedPathParts.length === 0 ? finalUrl : finalUrl.replace(/\/$/, "");

        return finalUrl;
    } catch (error) {
        console.error("Invalid URL:", url, error);
        return url;
    }
}

export interface ChapterLink {
    chapter: number;
    href: string;
}

/**
 * @description Collect every chapter link on the page, with its parsed number.
 *
 * Returning all of them (rather than only the highest) is what lets the caller pick
 * the *first unread* chapter to link to when several have been released at once.
 */
export async function getChapterLinks(
    document: Document,
    name?: string,
    site?: SiteInfo,
    manga?: MangaInfo
): Promise<ChapterLink[]> {
    const current = parseFloat(manga?.chapter || "0");
    const links = Array.from(document.querySelectorAll("a"));
    const targetLinks = links.filter(link => link.textContent?.toLowerCase().includes("chapter"));

    const found = new Map<number, string>();

    for (const link of targetLinks) {
        const chapterMatch = link.textContent?.match(/(\d+(?:\.\d+)?|\d+-\d+)(?!.*\d)/);
        if (!chapterMatch) continue;
        if (site && !link.href.includes(site.chapter_url)) continue;
        if (name && !link.href.includes(name)) continue;

        const chapterNumber = parseFloat(chapterMatch[1].replace("-", "."));
        if (Number.isNaN(chapterNumber)) continue;

        // Guard against a page listing an unrelated, far-future chapter number.
        if (chapterNumber - 20 >= current) continue;

        if (!found.has(chapterNumber)) found.set(chapterNumber, link.href);
    }

    return [...found.entries()]
        .map(([chapter, href]) => ({ chapter, href }))
        .sort((a, b) => a.chapter - b.chapter);
}

/**
 * @description Get the highest-numbered chapter link on the page
 * @returns The href of the chapter element, or "" when none matches
 */
export async function getChapterElement(
    document: Document,
    name?: string,
    site?: SiteInfo,
    manga?: MangaInfo
): Promise<string> {
    const links = await getChapterLinks(document, name, site, manga);
    return links.at(-1)?.href ?? "";
}

/** Finds the first anchor wrapping an image — used as a representative manga entry. */
function findMainLink(document: Document, baseUrl: string): string | null {
    const anchor = Array.from(document.querySelectorAll("a")).find(a => a.querySelector("img"));
    return anchor ? new URL(anchor.href, baseUrl).toString() : null;
}

/**
 * Derives a SiteInfo (list URL, chapter URL pattern, chapter limiter) from a site's
 * home page, falling back to a real browser when the static HTML yields nothing.
 *
 * Throws on failure. It previously swallowed every error and returned `{}`, which
 * then propagated as an "empty site" through the linking code and crashed with
 * "Cannot read properties of undefined (reading 'replace')". An unusable result must
 * never cross this boundary.
 */
export async function FetchSite(url: string): Promise<SiteInfo> {
    let hostname: string;
    try {
        hostname = new URL(url).hostname;
    } catch {
        throw new SiteParseError(`"${url}" is not a valid URL.`);
    }

    const siteName = hostname.split(".").filter(part => part !== "www")[0];
    if (!siteName) throw new SiteParseError(`Could not derive a site name from "${url}".`);

    // Static pass first: cheap, and enough for server-rendered sites.
    let mainLink = await withSiteDOM(url, page => findMainLink(page.document, page.finalUrl));

    // JS-rendered sites expose nothing to JSDOM, so retry through a real browser.
    if (!mainLink) {
        try {
            const rendered = await renderPage(url);
            mainLink = await withHtmlDOM(rendered.html, rendered.finalUrl, rendered.redirected, page =>
                findMainLink(page.document, page.finalUrl)
            );
        } catch (error) {
            if (error instanceof BrowserUnavailableError) {
                throw new SiteParseError(
                    `No manga links found on ${url} using plain HTML, and the browser fallback is unavailable. ${error.message}`
                );
            }
            throw new SiteParseError(`Browser rendering of ${url} failed: ${(error as Error).message}`);
        }
    }

    if (!mainLink) {
        throw new SiteParseError(`No manga entry link (an <a> wrapping an <img>) could be found on ${url}.`);
    }

    const chapterUrl = await withSiteDOM(mainLink, page => getChapterElement(page.document));

    if (!chapterUrl) {
        throw new SiteParseError(`No chapter link could be found on ${mainLink}, so the chapter URL pattern is unknown.`);
    }

    return {
        site: siteName,
        url: normalizeURL(mainLink) + "/",
        chapter_url: normalizeURL(chapterUrl, 2) + "/",
        chapter_limiter: getChapterLimiter(chapterUrl),
    };
}
