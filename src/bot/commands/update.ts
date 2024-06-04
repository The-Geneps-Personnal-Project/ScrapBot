import { SlashCommandBuilder, CommandInteraction, ChatInputCommandInteraction } from "discord.js";
import { getMangaFromName, getSiteFromName, getAllMangas, getAllSites } from "../../API/queries/get";
import { Command } from "../classes/command";
import { FetchSite } from "../../API/seed";
import { updateSiteInfo, updateMangaInfo } from "../../API/queries/update";
import { SiteInfo } from "../../types/types";

async function changeManga(interaction: CommandInteraction): Promise<void> {
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

async function changeSite(interaction: CommandInteraction): Promise<void> {
    try {
        let site = await getSiteFromName(interaction.options.get("site")?.value as string);
        if (!site) throw new Error("Site does not exist");

        const new_site = await FetchSite(interaction.options.get("url")?.value as string);

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
        ) as SlashCommandBuilder,
    run: async ({ client, interaction }) => {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(console.error);
        }
        const subcommand = interaction.options.getSubcommand();
        const subcommands: { [key: string]: (interaction: CommandInteraction) => Promise<void> } = {
            manga: changeManga,
            site: changeSite,
        };

        try {
            await subcommands[subcommand](interaction);
        } catch (error) {
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

        const filtered = choices.filter(choice => choice.name.toLowerCase().startsWith(focused.value.toLowerCase())).slice(0, 25);
        await interaction.respond(filtered.map(choice => ({ name: choice.name, value: choice.value })));
    },
});
