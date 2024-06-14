import puppeteer, { Page } from "puppeteer";
import { SiteInfo } from "../types/types";

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
    if (url[url.indexOf("chapter") - 1] === "-")
        normalized_url =
            normalized_url.slice(0, normalized_url.indexOf("chapter") - 1) +
            "/" +
            normalized_url.slice(normalized_url.indexOf("chapter"));
    const parts = normalized_url.split("/");

    toRemove = Math.min(toRemove, parts.length - 1);

    parts.splice(-toRemove, toRemove);

    return parts.join("/") + (parts.length === 2 ? "/" : "");
}

/**
 * @description Get the chapter element from the page (The first link containing "chapter" in the text)
 * @param page - The page to get the chapter element from
 * @returns - The href of the chapter element
 */
export async function getChapterElement(page: Page): Promise<string> {
    const href = await page.evaluate(() => {
        let highestChapterNumber = -Infinity;
        let highestChapterLink = "";
        const links = Array.from(document.querySelectorAll("a"));
        const targetLink = links.filter(link => link.textContent?.toLowerCase().includes("chapter"));
        targetLink.forEach(link => {
            const chapterMatch = link.textContent?.match(/(\d+(\.\d+)?)(?!.*\d)/);

            if (chapterMatch) {
                const chapterNumber = parseFloat(chapterMatch[1]);
                if (chapterNumber > highestChapterNumber) {
                    highestChapterNumber = chapterNumber;
                    highestChapterLink = link.href;
                }
            }
        });
        return highestChapterLink ? highestChapterLink : "";
    });
    return href;
}

/**
 * @description Get a manga from the main page given as parameter
 * @param page - The page to get the element from
 * @param selector - The selector to get the element from
 * @returns - The href of the element
 */
export async function getElement(page: Page, selector: string): Promise<string> {
    const link = await page.evaluate((selector: string) => {
        const links = Array.from(document.querySelectorAll(selector));

        const filteredLinks = links.filter(link => {
            return link.querySelector("img");
        });
        return (filteredLinks[3] as HTMLAnchorElement).href; // Return the 3rd element to be sure to have a manga and not decorative image
    }, selector);

    return link;
}

export async function FetchSite(url: string): Promise<SiteInfo> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });

    let siteInfo: SiteInfo = {} as SiteInfo;

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });

        const mainLink = await getElement(page, "a:has(img)");
        const siteName = new URL(url).hostname.split(".").filter(el => el != "www")[0];

        if (mainLink) {
            await page.goto(mainLink, { waitUntil: "domcontentloaded" });
            const listUrl = normalizeURL(mainLink);
            const chapterUrl = await getChapterElement(page);
            const chapterLimiter = getChapterLimiter(chapterUrl);

            siteInfo = {
                site: siteName,
                url: listUrl + "/",
                chapter_url: normalizeURL(chapterUrl, 2) + "/",
                chapter_limiter: chapterLimiter,
            };
            return siteInfo;
        }
    } catch (error) {
        console.error("Failed to create site:", error);
    } finally {
        await browser.close();
        return siteInfo;
    }
}
