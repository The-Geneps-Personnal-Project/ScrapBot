#!/usr/bin/env node
/**
 * Verifies that the scraping pool leaves no worker threads behind.
 *
 * Usage: node scripts/verify-worker-pool.js   (run `npm run build` first)
 *
 * How it proves the point: a live worker_thread keeps the Node event loop alive. If
 * even one worker survives a run, this process hangs instead of exiting. The script
 * therefore runs several scraping passes against a local server, then asserts that
 * the process can exit on its own within a short grace period.
 *
 * Against the old implementation (which faked `worker.emit("exit", 0)` instead of
 * calling `terminate()`), this hangs and reports leaked threads.
 */

const http = require("http");
const path = require("path");

const RUNS = 3;
const MANGAS_PER_RUN = 6;
/** Long enough for teardown to settle, short enough that a real leak is obvious. */
const EXIT_GRACE_MS = 3000;

/** Read chapter in the fixture. Chapters 506..510 are "released"; 506 is the first unread. */
const READ_CHAPTER = 505;
const LATEST_CHAPTER = 510;

function buildPage() {
    const links = [];
    for (let i = READ_CHAPTER - 2; i <= LATEST_CHAPTER; i++) {
        links.push(`<a href="/manga/test/chapter-${i}/">Chapter ${i}</a>`);
    }
    return `<!doctype html><html><head><title>Test Manga</title></head><body>${links.join("")}</body></html>`;
}

async function main() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildPage());
    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    console.log(`Test server on ${base}`);

    const { scrapeSiteInfo } = require(path.join(__dirname, "..", "dist", "scrap", "scraping.js"));

    const client = {
        dailyFeed: [],
        logger: message => console.log(`  [client] ${message}`),
    };

    const mangas = Array.from({ length: MANGAS_PER_RUN }, (_, i) => ({
        name: `Manga ${i}`,
        chapter: String(READ_CHAPTER),
        alert: 1,
        anilist_id: 0,
        sites: [
            {
                site: "local",
                url: `${base}/manga/test/`,
                // Mirrors what FetchSite derives: the list prefix shared by every chapter href.
                chapter_url: `${base}/manga/`,
                chapter_limiter: "/chapter-",
            },
        ],
    }));

    for (let run = 1; run <= RUNS; run++) {
        console.log(`\n--- Run ${run}/${RUNS} ---`);
        // dailyFeed would otherwise filter everything out after the first pass.
        client.dailyFeed = [];
        const [results, errors] = await scrapeSiteInfo(client, mangas);
        const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
        console.log(`Run ${run}: ${results.length} result(s), ${errors.length} error(s), RSS ${rss} MB`);

        if (run === 1) {
            const sample = results[0];
            if (!sample) throw new Error("Expected at least one scraping result from the fixture.");

            console.log(`  lastChapter=${sample.lastChapter} nextChapter=${sample.nextChapter}`);
            console.log(`  url=${sample.url}`);

            if (sample.lastChapter !== String(LATEST_CHAPTER))
                throw new Error(`Expected lastChapter ${LATEST_CHAPTER}, got ${sample.lastChapter}`);
            if (sample.nextChapter !== String(READ_CHAPTER + 1))
                throw new Error(`Expected nextChapter ${READ_CHAPTER + 1}, got ${sample.nextChapter}`);
            if (!sample.url.endsWith(`chapter-${READ_CHAPTER + 1}/`))
                throw new Error(`Expected the link to point at chapter ${READ_CHAPTER + 1}, got ${sample.url}`);

            console.log("  ✅ links to the first unread chapter, not the newest.");
        }
    }

    server.close();

    console.log(`\nAll runs finished. Waiting ${EXIT_GRACE_MS}ms to see whether the event loop drains...`);

    const timer = setTimeout(() => {
        console.error(
            "\n❌ FAIL: the process is still alive, which means at least one worker thread was never terminated."
        );
        process.exit(1);
    }, EXIT_GRACE_MS);

    // If every worker really was terminated, nothing else holds the loop open and the
    // process exits here rather than firing the timer above.
    timer.unref();

    process.on("exit", code => {
        if (code === 0) console.log("✅ PASS: process exited on its own — no worker threads leaked.");
    });
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
