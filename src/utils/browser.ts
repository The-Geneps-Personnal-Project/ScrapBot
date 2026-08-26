import type { Browser } from "puppeteer-core";

/**
 * Headless-browser fallback for sites that render their content with JavaScript.
 *
 * `fetch` + JSDOM cannot see those pages at all (JSDOM does not run scripts), which
 * is why FetchSite used to find no links and hand back an empty site object.
 *
 * Scope note: this is used only on the main thread, by /create site and /update site.
 * It is deliberately kept out of the scraping workers — putting browsers inside the
 * very threads whose lifecycle we just fixed would reintroduce the resource leak in a
 * more expensive form.
 */

/** Reused across calls: launching Chromium costs seconds and ~100MB on a Pi. */
let browserPromise: Promise<Browser> | null = null;

/** Idle browsers are shut down so a one-off /create site does not hold Chromium forever. */
const IDLE_SHUTDOWN_MS = 2 * 60 * 1000;
let idleTimer: NodeJS.Timeout | null = null;

const NAVIGATION_TIMEOUT_MS = 30_000;

export class BrowserUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BrowserUnavailableError";
    }
}

async function launch(): Promise<Browser> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

    if (!executablePath) {
        throw new BrowserUnavailableError(
            "PUPPETEER_EXECUTABLE_PATH is not set, so JavaScript-rendered sites cannot be parsed. " +
                "Install Chromium (apt install chromium-browser) and point this variable at it."
        );
    }

    const puppeteer = await import("puppeteer-core");

    return puppeteer.launch({
        executablePath,
        headless: true,
        // --no-sandbox is required to run Chromium as a non-root service user on the Pi.
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
}

function scheduleIdleShutdown(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void closeBrowser(), IDLE_SHUTDOWN_MS);
    idleTimer.unref?.();
}

export async function closeBrowser(): Promise<void> {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }

    const pending = browserPromise;
    browserPromise = null;
    if (!pending) return;

    try {
        const browser = await pending;
        await browser.close();
    } catch {
        // Nothing useful to do if a dying browser refuses to close.
    }
}

/** Renders `url` in a real browser and returns the resulting HTML. */
export async function renderPage(url: string): Promise<{ html: string; finalUrl: string; redirected: boolean }> {
    if (!browserPromise) {
        browserPromise = launch().catch(error => {
            browserPromise = null;
            throw error;
        });
    }

    const browser = await browserPromise;
    const page = await browser.newPage();

    try {
        const response = await page.goto(url, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT_MS });
        const finalUrl = page.url();

        if (response && !response.ok()) {
            throw new Error(`Browser fetch of ${url} returned ${response.status()}`);
        }

        return {
            html: await page.content(),
            finalUrl,
            redirected: finalUrl.replace(/\/+$/, "") !== url.replace(/\/+$/, ""),
        };
    } finally {
        await page.close().catch(() => undefined);
        scheduleIdleShutdown();
    }
}
