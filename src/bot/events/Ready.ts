import { Event } from "../classes/events";
import { CronJob } from "cron";
import { initiateScraping } from "../../scrap/scraping";

export default new Event({
    name: "ready",
    run: async client => {
        console.log("Deploying commands...");
        await client.deployCommands();
        console.log("Ready");

        const crontab = new CronJob("0 21 * * *", async () => {
            // Every day at 9pm (+1h with the server timezone)
            await client.chans.get("updates")?.bulkDelete(100);
            await initiateScraping(client);
        });

        if (!crontab.running) crontab.start();
    },
});
