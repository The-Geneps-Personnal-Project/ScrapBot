#!/usr/bin/env node
/**
 * Regression guard for redirect handling in the scraper.
 *
 * Sites routinely redirect: the API hands the scraper `site.url + slug`, which usually
 * has no trailing slash, and the site 301s to the canonical slashed form. A build that
 * skipped redirected pages returned zero chapters *and zero errors* for every manga —
 * silent, total failure.
 *
 * Usage: node scripts/verify-redirects.js   (run `npm run build` first)
 */

const http = require("http");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");
const { withSiteDOM } = require(path.join(dist, "utils", "fetch.js"));
const { isValidPage } = require(path.join(dist, "utils", "utils.js"));
const { getChapterLinks } = require(path.join(dist, "scrap", "seed.js"));

const READ = 505;

const chapterPage = () =>
    `<!doctype html><html><head><title>Berserk</title></head><body>${Array.from(
        { length: 6 },
        (_, i) => `<a href="/manga/berserk/chapter-${READ + i}/">Chapter ${READ + i}</a>`
    ).join("")}</body></html>`;

const failures = [];

function check(label, actual, expected) {
    const ok = actual === expected;
    console.log(`  ${ok ? "✅" : "❌"} ${label}${ok ? "" : `  (attendu ${expected}, obtenu ${actual})`}`);
    if (!ok) failures.push(label);
}

const server = http.createServer((req, res) => {
    const html = (body, code = 200) => {
        res.writeHead(code, { "Content-Type": "text/html" });
        res.end(body);
    };

    switch (req.url) {
        // Canonical trailing slash — by far the most common redirect.
        case "/manga/berserk":
            return res.writeHead(301, { Location: "/manga/berserk/" }).end();
        case "/manga/berserk/":
            return html(chapterPage());

        // Slug rewrite: the site moved the manga under a different prefix.
        case "/m/berserk":
            return res.writeHead(302, { Location: "/series/berserk/" }).end();
        case "/series/berserk/":
            return html(chapterPage());

        // Unknown manga: bounced to the site root.
        case "/manga/unknown":
            return res.writeHead(302, { Location: "/" }).end();
        case "/":
            return html("<!doctype html><html><head><title>Home</title></head><body></body></html>");

        default:
            return html("<!doctype html><html><head><title>404 Not Found</title></head></html>", 404);
    }
});

server.listen(0, "127.0.0.1", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const site = { site: "local", url: `${base}/manga/`, chapter_url: `${base}/manga/`, chapter_limiter: "/chapter-" };
    const manga = { name: "Berserk", chapter: String(READ) };

    try {
        console.log("Redirections tolérées par le scraper :");

        const slashed = await withSiteDOM(`${base}/manga/berserk`, page =>
            getChapterLinks(page.document, "manga", site, manga)
        );
        check("301 vers le slash final : les chapitres sont lus", slashed.length > 0, true);
        check("le plus haut chapitre est bien 510", slashed.at(-1).chapter, 510);

        console.log("\nisValidPage (utilisé pour lier un manga à un site) :");

        check(
            "301 vers le slash final -> valide",
            await withSiteDOM(`${base}/manga/berserk`, p => isValidPage(p, `${base}/manga/berserk`)),
            true
        );
        check(
            "302 réécrivant le slug -> valide",
            await withSiteDOM(`${base}/m/berserk`, p => isValidPage(p, `${base}/m/berserk`)),
            true
        );
        check(
            "302 vers la racine -> invalide (manga absent)",
            await withSiteDOM(`${base}/manga/unknown`, p => isValidPage(p, `${base}/manga/unknown`)),
            false
        );
    } catch (error) {
        console.error("\n❌ ERREUR:", error.message);
        failures.push(error.message);
    } finally {
        server.close();
    }

    console.log(
        failures.length === 0
            ? "\n✅ PASS: les redirections ne font plus disparaître les chapitres."
            : `\n❌ FAIL: ${failures.length} vérification(s) en échec.`
    );
    process.exit(failures.length === 0 ? 0 : 1);
});
