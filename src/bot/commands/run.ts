import { SlashCommandBuilder } from "discord.js";

import { Command } from "../classes/command";
import { initiateScraping, isScrapingInProgress } from "../../scrap/scraping";
import { COLORS, noticeCard } from "../ui";
import { respond, respondError } from "../ui/reply";

export default new Command({
    builder: new SlashCommandBuilder().setName("run").setDescription("Run the scraping process"),

    run: async ({ client, interaction }) => {
        try {
            if (isScrapingInProgress()) {
                await respond(interaction, [
                    noticeCard("⏳ Déjà en cours", "Un scraping tourne déjà. Attendez qu'il se termine.", COLORS.warning),
                ]);
                return;
            }

            // The reply is kept and edited rather than deleted. Deleting it first meant
            // every error path then called editReply on a message that no longer
            // existed, failing with "Unknown Message".
            await respond(interaction, [
                noticeCard("🔍 Scraping lancé", "Les résultats arriveront dans le salon des mises à jour.", COLORS.info),
            ]);

            await initiateScraping(client);

            await respond(interaction, [
                noticeCard("✅ Scraping terminé", "Consultez le salon des mises à jour.", COLORS.success),
            ]).catch(() => undefined); // The 15-minute token may have expired by now.
        } catch (error) {
            client.logger(`Failed to run scraping: ${(error as Error).message}`);
            await respondError(interaction, error, "Scraping impossible");
        }
    },
});
