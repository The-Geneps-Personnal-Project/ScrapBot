import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { getSiteFromName, getMangaFromName, getAllSites, getAllMangas } from "../../API/queries/get";
import { removeManga, removeSite, removeSiteFromManga } from "../../API/queries/delete";
import { Command } from "../classes/command";
import { isStringSimilarity } from "../../utils/utils";

async function site(interaction: CommandInteraction): Promise<void> {
    try {
        const url = interaction.options.get("site")?.value as string;
        const existingSite = await getSiteFromName(url);
        if (!existingSite) throw new Error("Site does not exists");

        await removeSite(url);
        interaction.editReply(`Removed site ${url}.`);
    } catch (error) {
        interaction.editReply((error as Error).message);
    }
}

async function manga(interaction: CommandInteraction): Promise<void> {
    try {
        const name = interaction.options.get("manga")?.value as string;
        const existingManga = await getMangaFromName(name);
        if (!existingManga) throw new Error("Manga does not exist");

        await removeManga(name);
        interaction.editReply(`Removed ${name} from the list.`);
    } catch (error) {
        interaction.editReply((error as Error).message);
    }
}

async function siteFromManga(interaction: CommandInteraction): Promise<void> {
    try {
        const manga = interaction.options.get("manga")?.value as string;
        const site = interaction.options.get("site")?.value as string;
        const existingManga = await getMangaFromName(manga);
        if (!existingManga) throw new Error("Manga does not exist");
        const existingSite = await getSiteFromName(site);
        if (!existingSite) throw new Error("Site does not exist");

        await removeSiteFromManga(existingSite.site, existingManga.name);
        interaction.editReply(`Removed ${site} from ${manga}.`);
    } catch (error) {
        interaction.editReply((error as Error).message);
    }
}

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
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(console.error);
        }
        const subcommand = interaction.options.getSubcommand();
        const subcommands: { [key: string]: (interaction: CommandInteraction) => Promise<void> } = {
            manga: manga,
            site: site,
            site_from_manga: siteFromManga,
        };

        try {
            await subcommands[subcommand](interaction);
            client.logger(`Removed ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to remove ${subcommand}: ${(error as Error).message}`);
            if (!interaction.replied) {
                await interaction
                    .followUp({ content: `Error: ${(error as Error).message}`, ephemeral: true })
                    .catch(console.error);
            } else {
                await interaction.editReply(`Error: ${(error as Error).message}`).catch(console.error);
            }
        }
    },
    autocomplete: async interaction => {
        const focused = interaction.options.getFocused(true);
        let choices: { name: string; value: string }[] = [];

        if (focused.name === "manga")
            choices = (await getAllMangas()).map(manga => ({ name: manga.name, value: manga.name }));
        else if (focused.name === "site")
            choices = (await getAllSites()).map(site => ({ name: site.site, value: site.site }));

        const filtered = choices
            .filter(choice =>  {
                const choiceText = choice.name.toLowerCase();
                const similarity = isStringSimilarity(choiceText, focused.value.toLowerCase());
                return similarity >= 0.5;
            })
            .slice(0, 25);
        await interaction.respond(filtered.map(choice => ({ name: choice.name, value: choice.value })));
    },
});
