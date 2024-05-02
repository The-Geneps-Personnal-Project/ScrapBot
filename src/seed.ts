import puppeteer, {Page} from "puppeteer";
import { addSite } from "./files";
import { SiteInfo } from "./types";

/**
 * @description Get the chapter limiter from the url
 * @param url The url to get the chapter limiter from
 * @returns 
 */
function getChapterLimiter(url: string): string {
    const index = url.indexOf("chapter");

    if (index === -1) return ""

    const before = index > 0 ? url.charAt(index - 1) : null;
    const after = index + "chapter".length < url.length ? url.charAt(index + "chapter".length) : null;

    return before + "chapter" + after
}

/**
 * @description Normalize the URL by removing the last parts
 * @param url - URL to normalize
 * @param toRemove - Number of parts to remove from the url (From the end)
 * @returns 
 */
function normalizeURL(url: string, toRemove : number = 1): string {
    const normalized_url = url.endsWith("/") ? url.slice(0, -1) : url;
    const parts = normalized_url.split("/")
    
    toRemove = Math.min(toRemove, parts.length - 1)

    parts.splice(-toRemove, toRemove)
    
    return parts.join("/") + (parts.length === 2 ? "/" : "")
}

/**
 * @description Get the chapter element from the page (The first link containing "chapter" in the text)
 * @param page - The page to get the chapter element from
 * @returns - The href of the chapter element
 */
export async function getChapterElement(page: Page): Promise<string> {
    const href = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const targetLink = links.find(link => link.textContent?.toLowerCase().includes("chapter"));
        return targetLink ? targetLink.href : "";
    });
    if (!href) return ""
    return href
}

/**
 * @description Get a manga from the main page given as parameter
 * @param page - The page to get the element from
 * @param selector - The selector to get the element from
 * @returns - The href of the element
 */
export async function getElement(page: Page , selector: string): Promise<string> {
    const link = await page.evaluate((selector: string) => {
        const links = Array.from(document.querySelectorAll(selector));

        const filteredLinks = links.filter((link) => {return link.querySelector("img")});
        return (filteredLinks[3] as HTMLAnchorElement).href; // Return the 3rd element to be sure to have a manga and not decorative image
    }, selector);

    return link
}

export async function createSite(url: string) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: "/usr/bin/chromium-browser",
    });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });

        const mainLink = await getElement(page, "a:has(img)");
        const siteName = new URL(url).hostname;

        if (mainLink) {
            await page.goto(mainLink, { waitUntil: "domcontentloaded" });
            const listUrl = normalizeURL(mainLink);
            const chapterUrl = await getChapterElement(page);
            const chapterLimiter = getChapterLimiter(chapterUrl);

            const siteInfo: SiteInfo = {
                site: siteName,
                url: listUrl,
                chapter_url: normalizeURL(chapterUrl, 2),
                chapter_limiter: chapterLimiter,
            };
            console.log("Creating site:", siteInfo);
            await addSite(siteInfo);
        }
    } catch (error) {
        console.error("Failed to create site:", error);
    } finally {
        await browser.close();
    }
}