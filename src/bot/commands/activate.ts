import { SlashCommandBuilder } from "discord.js";

import { Command } from "../classes/command";
import { getMangaFromName } from "../../API/queries/get";
import { getCachedMangas } from "../../API/cache";
import { updateMangaInfo } from "../../API/queries/update";
import { setMediaListStatus } from "../../database/graphql/graphql";
import { isStringSimilarity } from "../../utils/utils";
import { COLORS, noticeCard } from "../ui";
import { respond, respondError } from "../ui/reply";

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("activate")
        .setDescription("Passer un must watch en suivi actif")
        .addStringOption(option =>
            option
                .setName("manga")
                .setDescription("Le must watch à activer")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName("chapter").setDescription("Chapitre de départ (défaut : celui enregistré)")
        ) as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        try {
            const name = interaction.options.getString("manga", true);
            const chapter = interaction.options.getString("chapter");

            const manga = await getMangaFromName(name);
            if (!manga) throw new Error(`Le manga \`${name}\` n'existe pas.`);

            if (manga.status !== "must_watch") {
                throw new Error(`**${manga.name}** est déjà en suivi actif.`);
            }

            manga.status = "active";
            manga.alert = 1;
            if (chapter) manga.chapter = chapter;

            await updateMangaInfo(manga);

            // Mirrors the local promotion on AniList. Never fatal: the local change has
            // already been persisted at this point.
            const marked = await setMediaListStatus(manga.anilist_id, "CURRENT");

            await respond(interaction, [
                noticeCard(
                    `📕 ${manga.name} activé`,
                    [
                        `Suivi actif à partir du chapitre **${manga.chapter || "?"}**.`,
                        `Alertes activées · ${manga.sites.length} site${manga.sites.length > 1 ? "s" : ""} lié${manga.sites.length > 1 ? "s" : ""}.`,
                        marked
                            ? "Marqué **CURRENT** sur AniList."
                            : "_Non marqué sur AniList (token absent ou API indisponible)._",
                    ].join("\n"),
                    COLORS.success
                ),
            ]);

            client.logger(`Activated must-watch ${manga.name}.`);
        } catch (error) {
            client.logger(`Failed to activate: ${(error as Error).message}`);
            await respondError(interaction, error, "Activation impossible");
        }
    },

    autocomplete: async interaction => {
        const focused = interaction.options.getFocused(true);

        // Only must-watch entries can be activated, so only offer those.
        const filtered = (await getCachedMangas())
            .filter(manga => manga.status === "must_watch")
            .map(manga => ({ name: manga.name, value: manga.name }))
            .filter(choice => isStringSimilarity(choice.name.toLowerCase(), focused.value.toLowerCase()) >= 0.5)
            .slice(0, 25);

        await interaction.respond(filtered);
    },
});
