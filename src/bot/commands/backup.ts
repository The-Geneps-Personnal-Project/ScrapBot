import { SlashCommandBuilder } from "discord.js";

import { Command } from "../classes/command";
import { postDailyDigest } from "../backup";
import { COLORS, noticeCard } from "../ui";
import { respond, respondError } from "../ui/reply";

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("backup")
        .setDescription("Publier maintenant le backup des chapitres mis à jour depuis le dernier reset")
        .addBooleanOption(option =>
            option
                .setName("reset")
                .setDescription("Vider aussi le suivi du jour, comme le fait le reset de 06:45")
        ) as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        try {
            const reset = interaction.options.getBoolean("reset") ?? false;
            const count = client.dailyFeed.length;

            if (count === 0) {
                await respond(interaction, [
                    noticeCard(
                        "🗂️ Rien à sauvegarder",
                        "Aucune mise à jour enregistrée depuis le dernier reset.",
                        COLORS.neutral
                    ),
                ]);
                return;
            }

            const posted = await postDailyDigest(client, client.dailyFeed);
            if (!posted) throw new Error("Le salon `backup` n'est pas configuré ou est injoignable.");

            if (reset) client.dailyFeed = [];

            await respond(interaction, [
                noticeCard(
                    "🗂️ Backup publié",
                    `**${count}** chapitre${count > 1 ? "s" : ""} dans le salon backup.` +
                        (reset ? "\nSuivi du jour réinitialisé." : ""),
                    COLORS.success
                ),
            ]);

            client.logger(`Posted backup digest on demand (${count} entries, reset=${reset}).`);
        } catch (error) {
            client.logger(`Failed to post backup: ${(error as Error).message}`);
            await respondError(interaction, error, "Backup impossible");
        }
    },
});
