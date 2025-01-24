import { Event } from "../classes/events";
import { CronJob } from "cron";
import { initiateScraping } from "../../scrap/scraping";

export default new Event({
    name: "ready",
    run: async client => {
        console.log("Deploying commands...");
        await client.deployCommands();
        console.log("Ready");

        const crontab = new CronJob("0 7-23/3 * * *", async () => {
            await initiateScraping(client);
        });

        const dailyReset = new CronJob("45 6 * * *", async () => {
            await client.chans.get("updates")?.bulkDelete(100);
            client.dailyFeed = [];
        })

        if (!crontab.running) crontab.start();
        if (!dailyReset.running) dailyReset.start();
    },
});
