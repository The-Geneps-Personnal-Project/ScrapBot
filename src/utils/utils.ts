import { Page } from "puppeteer";

export function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

export async function isValidPage(page: Page, url: string): Promise<Boolean> {
    const toUrl = page.url().replace(/\/$/, "");
    const pageTitle = await page.title();

    const possibleErrorMessages = ["404", "Not found", "Page not found", "Error", "Sorry"];

    if (toUrl !== url) return false;
    for (const messages of possibleErrorMessages) {
        if (pageTitle.toLowerCase().includes(messages.toLowerCase())) return false;
    }
    return true;
}

export function isStringSimilarity(choiceText: string, input: string): number {
    if (input === "") return 1
    const tokens = input.toLowerCase().split(/\s+/).filter(token => token.length > 0);
    const matches = tokens.filter(token => choiceText.includes(token)).length;
    return matches / tokens.length;
}