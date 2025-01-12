export function replaceURL(url: string): string {
    const withoutSpaces = url.replace(/ /g, "-");
    return withoutSpaces.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

export async function isValidPage(document: Document, url: string): Promise<Boolean> {
    const currentUrl = document.location.href.replace(/\/$/, "");
    const pageTitle = document.title;

    const possibleErrorMessages = ["404", "Not found", "Page not found", "Error", "Sorry"];

    if (currentUrl !== url) return false;
    for (const message of possibleErrorMessages) {
        if (pageTitle.toLowerCase().includes(message.toLowerCase())) return false;
    }
    return true;
}

export function isStringSimilarity(choiceText: string, input: string): number {
    if (input === "") return 1
    const tokens = input.toLowerCase().split(/\s+/).filter(token => token.length > 0);
    const matches = tokens.filter(token => choiceText.includes(token)).length;
    return matches / tokens.length;
}