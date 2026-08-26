import { SlashCommandBuilder } from "discord.js";

import { Command } from "../classes/command";
import { getLastRun, isScrapingInProgress } from "../../scrap/scraping";
import { getNextScrapingRun, getUpcomingScrapingRuns, schedulersRunning } from "../scheduler";
import { statusCard } from "../ui";
import { respond, respondError } from "../ui/reply";

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Voir dans combien de temps passe le prochain scraping") as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        try {
            await respond(interaction, [
                statusCard({
                    scheduled: schedulersRunning(),
                    inProgress: isScrapingInProgress(),
                    nextRun: getNextScrapingRun(),
                    upcoming: getUpcomingScrapingRuns(4).slice(1),
                    lastRun: getLastRun(),
                    dailyFeed: client.dailyFeed.length,
                }),
            ]);
        } catch (error) {
            client.logger(`Failed to build status: ${(error as Error).message}`);
            await respondError(interaction, error, "Statut indisponible");
        }
    },
});
