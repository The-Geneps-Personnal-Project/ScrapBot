import { CronJob } from "cron";

import { Event } from "../classes/events";
import { initiateScraping } from "../../scrap/scraping";
import CustomClient from "../classes/client";

/**
 * Module scope, not function scope.
 *
 * `ready` fires again on every reconnect/resume. When these lived inside the handler,
 * each reconnect built fresh CronJob objects whose `isActive` was of course false,
 * and started a *second* scraping scheduler on top of the first.
 */
let scrapingJob: CronJob | null = null;
let dailyResetJob: CronJob | null = null;

async function clearUpdatesChannel(client: CustomClient): Promise<void> {
    const channel = client.chans.get("updates");
    if (!channel) return;

    try {
        await channel.bulkDelete(100);
    } catch (error) {
        // bulkDelete refuses messages older than 14 days; that is expected, not fatal.
        client.logger(`Could not clear the updates channel: ${(error as Error).message}`);
    }
}

export default new Event({
    name: "ready",
    run: async client => {
        // Resolved here rather than in start(): `ready` fires during login, so anything
        // that touched client.chans before this point raced an empty collection.
        await client.resolveChannels();

        try {
            await client.deployCommands();
        } catch (error) {
            client.logger(`Failed to deploy commands: ${(error as Error).message}`);
        }

        if (!scrapingJob) {
            scrapingJob = new CronJob("0 7-23/3 * * *", () => {
                void initiateScraping(client);
            });
            scrapingJob.start();
            client.logger("Scraping scheduler started (every 3h, 07:00-23:00).");
        }

        if (!dailyResetJob) {
            dailyResetJob = new CronJob("45 6 * * *", async () => {
                await clearUpdatesChannel(client);
                client.dailyFeed = [];
            });
            dailyResetJob.start();
            client.logger("Daily reset scheduler started (06:45).");
        }

        // Catch-up for a bot that was offline at the scheduled reset time.
        await clearUpdatesChannel(client);
        client.logger("Ready.");
    },
});
