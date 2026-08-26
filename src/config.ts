/**
 * Startup configuration check.
 *
 * Missing variables used to surface far from their cause: an unset API base URL made
 * `getApiBaseUrl()` return the literal string "undefined", so requests went to
 * "undefined/mangas" and failed with an opaque URL error instead of a config error.
 */

interface Requirement {
    name: string;
    required: boolean;
    hint: string;
}

function requirements(): Requirement[] {
    const isProduction = process.env.NODE_ENV === "production";

    return [
        { name: "TOKEN", required: true, hint: "Discord bot token" },
        { name: "GUILD_ID", required: true, hint: "guild the slash commands are deployed to" },
        {
            name: isProduction ? "API_URL" : "API_TEST_URL",
            required: true,
            hint: `ScrapAPI base URL for NODE_ENV=${process.env.NODE_ENV ?? "development"}`,
        },
        { name: isProduction ? "UPDATE" : "TEST_UPDATE", required: false, hint: "channel for chapter notifications" },
        { name: isProduction ? "ERROR" : "TEST_ERROR", required: false, hint: "channel for scraping errors" },
        { name: "ANILIST_TOKEN", required: false, hint: "needed only to sync read progress to AniList" },
        {
            name: "PUPPETEER_EXECUTABLE_PATH",
            required: false,
            hint: "needed only to parse JavaScript-rendered sites",
        },
    ];
}

/** Throws when a required variable is missing; warns about optional ones. */
export function assertConfig(): void {
    const missing: string[] = [];

    for (const { name, required, hint } of requirements()) {
        if (process.env[name]) continue;

        if (required) missing.push(`  ${name} — ${hint}`);
        else console.warn(`[config] ${name} is not set: ${hint}.`);
    }

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables:\n${missing.join("\n")}`);
    }
}
