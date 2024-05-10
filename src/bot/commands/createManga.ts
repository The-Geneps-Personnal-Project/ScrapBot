import { SlashCommandBuilder, CommandInteraction, ApplicationCommandOption } from "discord.js";
import { MangaInfo } from "../../types/types";
import { getSiteFromName, getMangaFromName, addManga } from "../../database/sqlite/database";

async function createSite(interaction: CommandInteraction) {
    // Create a site in the database
}

async function createManga(interaction: CommandInteraction) {
    try {
        const manga: MangaInfo = {
            anilist_id: interaction.options.getNumber('anilistID'),
            chapter: interaction.options.getString('chapter') as string,
            name: interaction.options.getString('name') as string,
            sites: await getSiteFromName(interaction.options.getString('site') as string),
        };
        const existingManga = await getMangaFromName(manga.name);
        if (existingManga.length > 0) throw new Error("Manga already exists");

        await addManga(manga);
    } catch (error) {
        interaction.reply((error as Error).message);
    }}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('create')
		.setDescription('Create a manga or a site')
        .addSubcommand(subcommand => subcommand
            .setName('manga')
            .setDescription('Add a manga to the database')
            .addNumberOption(option => option.setName('anilistID').setDescription('The Anilist ID').setRequired(true))
            .addStringOption(option => option.setName('chapter').setDescription('The last read chapter').setRequired(true))
            .addStringOption(option => option.setName('name').setDescription('THe name of the manga').setRequired(true))
            .addStringOption(option => option.setName('site').setDescription('The site of the manga').setRequired(true))
        )
        .addSubcommand(subcommand => subcommand
            .setName('site')
            .setDescription('Add a site to the database')
            .addStringOption(option => option.setName('url').setDescription('The url of the site').setRequired(true))
        ),
async execute(interaction: CommandInteraction & { options: { getSubcommand(): string } }) {
    const subcommand = interaction.options.getSubcommand();
    const subcommands: { [key: string]: (interaction: CommandInteraction) => Promise<void> } = {
        manga: createManga,
        site: createSite,
    };

    subcommands[subcommand](interaction);
},
};