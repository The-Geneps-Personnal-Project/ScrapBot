import puppeteer, {Page} from "puppeteer";
import { SiteInfo } from "./types";

export async function getChapterElement(page: Page): Promise<string | null> {
    const href = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const targetLink = links.find(link => link.textContent?.toLowerCase().includes("chapter"));
        return targetLink ? targetLink.href : null;
    });
    console.log(href)
    return href;
}

export async function getElement(page: Page , selector: string): Promise<string> {
    const link = await page.evaluate((selector: string) => {
        const links = Array.from(document.querySelectorAll(selector));

        const filteredLinks = links.filter((link) => {return link.querySelector("img")});
        return (filteredLinks[3] as HTMLAnchorElement).href;
    }, selector);

    return link
}

export async function addSite(url: string) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        //executablePath: "/usr/bin/chromium-browser", // Remove comment before pushing to prod
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const link = await getElement(page, "a:has(img)")
    
    const site_name = url.split("/")[2]

    await page.goto(link, { waitUntil: "domcontentloaded" });

    const pathSegments = link?.split('/').filter(el => el.length > 0)
    pathSegments?.pop()

    const list_url = pathSegments?.join("/")
    const chapter_url = await getChapterElement(page)

    // Get -chapter or /chapter depending on the site
    // for exemple:
    // https://mangadex.org/manga/exemple-chapter-150
    // https://mangadex.org/manga/exemple/chapter-150
    // https://mangadex.org/manga/exemple/chapter/150
    // TO EDIT IF: Need of the chapter behind or only the character before chapter
    const chapter_limiter = chapter_url?.split("chapter")[0].split("").pop();

    const site = {
        site: site_name,
        url: list_url,
        chapter_url: chapter_url,
        chapter_limiter: chapter_limiter,
    } as SiteInfo

    // TODO: Implement function to add site in database giving site as parameter

    await browser.close();
}