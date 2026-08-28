import { Event } from "../classes/events";
import CustomClient from "../classes/client";
import { startSchedulers } from "../scheduler";
import { postDailyDigest } from "../backup";

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

        startSchedulers(client, async () => {
            // Order matters: the digest is the record of what is about to be deleted.
            await postDailyDigest(client, client.dailyFeed);
            await clearUpdatesChannel(client);
            client.dailyFeed = [];
        });

        // Catch-up for a bot that was offline at the scheduled reset time.
        await clearUpdatesChannel(client);
        client.logger("Ready.");
    },
});
