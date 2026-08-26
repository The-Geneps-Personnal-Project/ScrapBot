import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

import { getSiteFromName, getMangaFromName } from "../../API/queries/get";
import { getCachedMangas, getCachedSites } from "../../API/cache";
import { removeManga, removeSite, removeSiteFromManga } from "../../API/queries/delete";
import { Command } from "../classes/command";
import { isStringSimilarity } from "../../utils/utils";
import { COLORS, noticeCard } from "../ui";
import { respond, respondError } from "../ui/reply";

async function deleteSite(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("site", true);

    const site = await getSiteFromName(name);
    if (!site) throw new Error(`Le site \`${name}\` n'existe pas.`);

    await removeSite(site.site);
    await respond(interaction, [noticeCard("🗑️ Site supprimé", `**${site.site}** a été retiré.`, COLORS.warning)]);
}

async function deleteManga(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("manga", true);

    const manga = await getMangaFromName(name);
    if (!manga) throw new Error(`Le manga \`${name}\` n'existe pas.`);

    await removeManga(manga.name);
    await respond(interaction, [noticeCard("🗑️ Manga supprimé", `**${manga.name}** a été retiré.`, COLORS.warning)]);
}

async function deleteSiteFromManga(interaction: ChatInputCommandInteraction): Promise<void> {
    const mangaName = interaction.options.getString("manga", true);
    const siteName = interaction.options.getString("site", true);

    const manga = await getMangaFromName(mangaName);
    if (!manga) throw new Error(`Le manga \`${mangaName}\` n'existe pas.`);

    const site = await getSiteFromName(siteName);
    if (!site) throw new Error(`Le site \`${siteName}\` n'existe pas.`);

    await removeSiteFromManga(site.site, manga.name);
    await respond(interaction, [
        noticeCard("🔗 Lien supprimé", `\`${site.site}\` n'est plus lié à **${manga.name}**.`, COLORS.warning),
    ]);
}

const handlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
    manga: deleteManga,
    site: deleteSite,
    site_from_manga: deleteSiteFromManga,
};

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a manga or a site")
        .addSubcommand(subcommand =>
            subcommand
                .setName("manga")
                .setDescription("Remove a manga from the database")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site")
                .setDescription("Remove a site from the database")
                .addStringOption(option =>
                    option
                        .setName("site")
                        .setDescription("The name of the site")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site_from_manga")
                .setDescription("Remove a site from a manga")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName("site")
                        .setDescription("The name of the site")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ) as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        const subcommand = interaction.options.getSubcommand();

        try {
            await handlers[subcommand](interaction);
            client.logger(`Removed ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to remove ${subcommand}: ${(error as Error).message}`);
            await respondError(interaction, error, `Suppression impossible · ${subcommand}`);
        }
    },

    autocomplete: async interaction => {
        const focused = interaction.options.getFocused(true);
        let choices: { name: string; value: string }[] = [];

        if (focused.name === "manga") {
            choices = (await getCachedMangas()).map(manga => ({ name: manga.name, value: manga.name }));
        } else if (focused.name === "site") {
            choices = (await getCachedSites()).map(site => ({ name: site.site, value: site.site }));
        }

        const filtered = choices
            .filter(choice => isStringSimilarity(choice.name.toLowerCase(), focused.value.toLowerCase()) >= 0.5)
            .slice(0, 25);

        await interaction.respond(filtered);
    },
});
