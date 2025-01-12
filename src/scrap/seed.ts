import { MangaInfo, SiteInfo } from "../types/types";
import { fetchSiteDOM } from "../utils/fetch";

/**
 * @description Get the chapter limiter from the url
 * @param url The url to get the chapter limiter from
 * @returns
 */
function getChapterLimiter(url: string): string {
    const index = url.indexOf("chapter");

    if (index === -1) return "";

    const before = index > 0 ? url.charAt(index - 1) : null;
    const after = index + "chapter".length < url.length ? url.charAt(index + "chapter".length) : null;

    return before + "chapter" + after;
}

/**
 * @description Normalize the URL by removing the last parts
 * @param url - URL to normalize
 * @param toRemove - Number of parts to remove from the url (From the end)
 * @returns
 */
function normalizeURL(url: string, toRemove: number = 1): string {
    let normalized_url = url.endsWith("/") ? url.slice(0, -1) : url;

    const chapterIndex = normalized_url.indexOf("chapter");
    if (chapterIndex > 0 && normalized_url[chapterIndex - 1] === "-") {
        normalized_url =
            normalized_url.slice(0, chapterIndex - 1) +
            "/" +
            normalized_url.slice(chapterIndex);
    }

    try {
        const parsedUrl = new URL(normalized_url);

        const pathParts = parsedUrl.pathname.split("/").filter(part => part);
        toRemove = Math.min(toRemove, pathParts.length);
        const updatedPathParts = pathParts.slice(0, pathParts.length - toRemove);

        parsedUrl.pathname = "/" + updatedPathParts.join("/");

        let finalUrl = parsedUrl.toString().replace(/([^:]\/)\/+/g, "$1");
        finalUrl = finalUrl.endsWith("/") && updatedPathParts.length === 0
            ? finalUrl 
            : finalUrl.replace(/\/$/, "");

        return finalUrl;
    } catch (error) {
        console.error("Invalid URL:", url, error);
        return url;
    }
}




/**
 * @description Get the chapter element from the page (The first link containing "chapter" in the text)
 * @param page - The page to get the chapter element from
 * @returns - The href of the chapter element
 */
export async function getChapterElement(
    document: Document,
    name?: string,
    site?: SiteInfo,
    manga?: MangaInfo
): Promise<string> {
    let highestChapterNumber = -Infinity;
    let highestChapterLink = "";

    const links = Array.from(document.querySelectorAll("a"));
    const targetLinks = links.filter(link =>
        link.textContent?.toLowerCase().includes("chapter")
    );

    targetLinks.forEach(link => {
        const chapterMatch = link.textContent?.match(/(\d+(?:\.\d+)?|\d+-\d+)(?!.*\d)/);
        if (
            chapterMatch &&
            (site ? link.href.includes(site.chapter_url) : true) &&
            (name ? link.href.includes(name) : true)
        ) {
            const chapterNumber = parseFloat(chapterMatch[1].replace("-", "."));
            if (
                chapterNumber > highestChapterNumber &&
                chapterNumber - 20 < parseFloat(manga?.chapter || "0")
            ) {
                highestChapterNumber = chapterNumber;
                highestChapterLink = link.href;
            }
        }
    });

    return highestChapterLink ? highestChapterLink : "";
}


/**
 * @description Get a manga from the main page given as parameter
 * @param page - The page to get the element from
 * @param selector - The selector to get the element from
 * @returns - The href of the element
 */
export async function getElement(document: Document, selector: string): Promise<string> {
    const links = Array.from(document.querySelectorAll(selector));

    const filteredLinks = links.filter(link => link.querySelector("img"));

    const link = filteredLinks[3] as HTMLAnchorElement | undefined;
    return link ? link.href : "";
}


export async function FetchSite(url: string): Promise<SiteInfo> {
    let siteInfo: SiteInfo = {} as SiteInfo;

    try {
        const document = await fetchSiteDOM(url);

        const mainLinkElement = Array.from(document.querySelectorAll("a")).find(anchor =>
            anchor.querySelector("img")
        );
        const mainLink = mainLinkElement ? new URL(mainLinkElement.href, url).toString() : null;
        const siteName = new URL(url).hostname.split(".").filter(el => el !== "www")[0];

        if (mainLink) {
            const mainDocument = await fetchSiteDOM(mainLink);

            const listUrl = normalizeURL(mainLink);
            const chapterUrl = await getChapterElement(mainDocument);
            const chapterLimiter = getChapterLimiter(chapterUrl);

            siteInfo = {
                site: siteName,
                url: listUrl + "/",
                chapter_url: normalizeURL(chapterUrl, 2) + "/",
                chapter_limiter: chapterLimiter,
            };
        }
    } catch (error) {
        console.error("Failed to create site:", error);
    }

    return siteInfo;
}


