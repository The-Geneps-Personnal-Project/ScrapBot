import puppeteer, {Page} from "puppeteer";

async function getElement(page: Page , selector: string): Promise<Element> {
    const link = await page.evaluate((selector: string) => {
        const links = Array.from(document.querySelectorAll(selector));

        let res = []

        for (const link of links) {
            if (link.querySelector("img")) {
                res.push(link);
            }
        }
        return res[3]; // 3 To be safe in case the first one are not mangas
    }, selector);

    return link
}

export async function addSite(url: string, name: string) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
        executablePath: "/usr/bin/chromium-browser",
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const selector = "a:has(img)"
    const link = await getElement(page, selector)

    console.log(link)

    const pathSegments = link.getAttribute("href")?.split('/').filter(el => el.length > 0)
    pathSegments?.pop()

    const list_url = pathSegments?.join("/")
    console.log(list_url)
    await browser.close();
}