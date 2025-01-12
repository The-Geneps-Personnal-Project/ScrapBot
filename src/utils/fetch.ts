import { JSDOM } from 'jsdom';

export async function fetchSiteDOM(url: string): Promise<Document> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    const html = await response.text();

    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    return document;
}