import { CommandInteraction, EmbedBuilder } from "discord.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { GraphqlQueryMediaOutput, MangaInfo } from "../../types/types";
import { FetchSite } from "../../API/seed";
import { Command } from "../classes/command";
import { addManga, addSite, addSiteToManga } from "../../API/queries/create";
import { getAllMangas, getAllSites, getMangaFromName, getSiteFromName } from "../../API/queries/get";
import { getMangaInfos } from "../../database/graphql/graphql";
import { scrapExistingSite } from "../../scrap/scraping";
import { isStringSimilarity } from "../../utils/utils";

async function site(interaction: CommandInteraction): Promise<void> {
    try {
        const url = interaction.options.get("url")?.value as string;
        const completeUrl = url.startsWith("https") ? url : `https://${url}`;
        const existingSite = await getSiteFromName(completeUrl.split("/")[2].split(".")[0]);
        if (existingSite) throw new Error("Site already exists");

        const site = await FetchSite(completeUrl);
        await addSite(site);
        const [nbr, list] = await scrapExistingSite(site);
        const embed = new EmbedBuilder()
            .setTitle(site.site)
            .setDescription(`Added to the list. ${nbr} mangas linked.`)
            .addFields(
                ...list.map((manga: string) => ({
                    name: manga,
                    value: " ",
                    inline: true,
                })))
            .setColor("#00FF00");
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply((error as Error).message);
    }
}

async function manga(interaction: CommandInteraction): Promise<void> {
    try {
        const manga: MangaInfo = {
            anilist_id: interaction.options.get("anilist_id")?.value as number,
            chapter: interaction.options.get("chapter")?.value as string,
            name: interaction.options.get("name")?.value as string,
            sites: [],
            infos: (await getMangaInfos(
                interaction.options.get("anilist_id")?.value as number
            )) as GraphqlQueryMediaOutput,
        };
        const existingManga = await getMangaFromName(manga.name);
        if (existingManga) throw new Error("Manga already exists");

        await addManga(manga);
        const [nbr, list] = await scrapExistingSite(manga);
        const embed = new EmbedBuilder()
            .setTitle(manga.name)
            .setDescription(`Added to the list. ${nbr} sites linked.`)
            .addFields(
                ...list.map((site: string) => ({
                    name: site,
                    value: " ",
                    inline: true,
                })))
            .setColor("#00FF00");
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply((error as Error).message);
    }
}

async function siteToManga(interaction: CommandInteraction): Promise<void> {
    try {
        const manga = interaction.options.get("manga")?.value as string;
        const site = interaction.options.get("site")?.value as string;
        const existingManga = await getMangaFromName(manga);
        if (!existingManga) throw new Error("Manga does not exist");
        const existingSite = await getSiteFromName(site);
        if (!existingSite) throw new Error("Site does not exist");

        await addSiteToManga(existingSite.site, existingManga.name);
        await interaction.editReply(`Added ${site} to ${manga}.`);
    } catch (error) {
        await interaction.editReply((error as Error).message);
    }
}

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("create")
        .setDescription("Create a manga or a site")
        .addSubcommand(subcommand =>
            subcommand
                .setName("manga")
                .setDescription("Add a manga to the database")
                .addNumberOption(option =>
                    option.setName("anilist_id").setDescription("The Anilist ID").setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("chapter").setDescription("The last read chapter").setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("name").setDescription("The name of the manga").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site")
                .setDescription("Add a site to the database")
                .addStringOption(option =>
                    option.setName("url").setDescription("The url of the site").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site_to_manga")
                .setDescription("Add a site to a manga")
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
            site_to_manga: siteToManga,
        };

        try {
            await subcommands[subcommand](interaction);
            client.logger(`Created ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to create ${subcommand}: ${(error as Error).message}`);
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
