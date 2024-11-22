import { SlashCommandBuilder, CommandInteraction, ChatInputCommandInteraction } from "discord.js";
import { getMangaFromName, getSiteFromName, getAllMangas, getAllSites } from "../../API/queries/get";
import { Command } from "../classes/command";
import { FetchSite } from "../../scrap/seed";
import { updateSiteInfo, updateMangaInfo } from "../../API/queries/update";
import { SiteInfo } from "../../types/types";
import { isStringSimilarity } from "../../utils/utils";
import { scrapExistingSite } from "../../scrap/scraping";
import { getMangaInfos } from "../../database/graphql/graphql";
import CustomClient from "../classes/client";

async function changeManga(client: CustomClient, interaction: CommandInteraction): Promise<void> {
    try {
        const manga = await getMangaFromName(interaction.options.get("manga")?.value as string);
        if (!manga) throw new Error("Manga does not exist");

        if (interaction.options.get("key")?.value === "alert")
            manga.alert = interaction.options.get("value")?.value as Number;
        else if (interaction.options.get("key")?.value === "chapter")
            manga.chapter = interaction.options.get("value")?.value as string;

        await updateMangaInfo(manga);
        await interaction.editReply(
            `Changed ${interaction.options.get("key")?.value} to ${interaction.options.get("value")?.value} for ${manga.name}.`
        );
    } catch (error) {
        console.log(error);
        await interaction.editReply((error as Error).message);
    }
}

async function changeSite(client: CustomClient, interaction: CommandInteraction): Promise<void> {
    try {
        let site = await getSiteFromName(interaction.options.get("site")?.value as string);
        if (!site) throw new Error("Site does not exist");

        const url = interaction.options.get("url")?.value as string;
        const completeUrl = url.startsWith("https") ? url : `https://${url}`;

        const new_site = await FetchSite(completeUrl);

        const toUpdate = {
            id: site.id,
            site: site.site,
            url: new_site.url,
            chapter_url: new_site.chapter_url,
            chapter_limiter: new_site.chapter_limiter,
        } as SiteInfo;

        await updateSiteInfo(toUpdate);

        await interaction.editReply(`Updated ${site.site}.`);
    } catch (error) {
        console.log(error);
        await interaction.editReply((error as Error).message);
    }
}

async function updateMangaAll(client: CustomClient, interaction: CommandInteraction): Promise<void> {
    try {
        const value = interaction.options.get("manga")?.value as string;
        const mangas = value === "all" ? await getAllMangas() : [await getMangaFromName(value)];
        const allSites = await getAllSites();
        const res: [string, string[]][] = [];

        for (let manga of mangas) {
            client.logger(`Updating ${manga.name}...`);
            const newSites = allSites.filter(site => !manga.sites.some(s => s.site === site.site));
            const [count, list] = await scrapExistingSite(manga, newSites);
            client.logger(`Added ${count} sites to ${manga.name}.`);
            client.logger(`Checking infos for manga ${manga.name}: ${manga.infos?.description}, ${manga.infos?.coverImage}, ${manga.infos?.tags.length}`);
            if (!manga.infos?.description || !manga.infos?.coverImage || manga.infos.tags.length === 0) {
                manga.infos = await getMangaInfos(manga.anilist_id);
                client.logger(`Updated infos for manga ${manga.name}: ${manga.infos?.description}, ${manga.infos?.coverImage}, ${manga.infos?.tags.length}`);
                await updateMangaInfo(manga);
            }
            res.push([manga.name, list]);
            await new Promise(f => setTimeout(f, 1000 * 7.5));
        }

        await interaction.channel?.send(
            res.map(([manga, list]) => "Added to " + manga + ": " + list.join(", ")).join("\n")
        );
    } catch (error) {
        console.error(`Failed to update manga sites:`, error);
        throw error;
    }
}

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("update")
        .setDescription("Update a manga or a site")
        .addSubcommand(subcommand =>
            subcommand
                .setName("manga")
                .setDescription("Update a manga")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName("key").setDescription("The key to change").setRequired(true).setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName("value")
                        .setDescription("The value to change")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site")
                .setDescription("Update a site")
                .addStringOption(option =>
                    option
                        .setName("site")
                        .setDescription("The name of the site")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName("url").setDescription("The url of the site").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("all")
                .setDescription("Update all sites of a manga")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ) as SlashCommandBuilder,
    run: async ({ client, interaction }) => {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(console.error);
        }
        const subcommand = interaction.options.getSubcommand();
        const subcommands: { [key: string]: (client:CustomClient, interaction: CommandInteraction) => Promise<void> } = {
            manga: changeManga,
            site: changeSite,
            all: updateMangaAll,
        };

        try {
            await subcommands[subcommand](client, interaction);
            client.logger(`Updated ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to update ${subcommand}: ${(error as Error).message}`);
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
        else if (focused.name === "key")
            choices = ["alert", "chapter"].map(choice => ({ name: choice, value: choice }));
        else if (focused.name === "value")
            choices = [
                { name: "true", value: "1" },
                { name: "false", value: "0" },
            ];

        const filtered = choices
            .filter(choice => {
                const choiceText = choice.name.toLowerCase();
                const similarity = isStringSimilarity(choiceText, focused.value.toLowerCase());
                return similarity >= 0.5;
            })
            .slice(0, 25);
        await interaction.respond(filtered.map(choice => ({ name: choice.name, value: choice.value })));
    },
});
