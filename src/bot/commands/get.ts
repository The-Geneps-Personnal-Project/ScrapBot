import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getMangaFromName, getAllMangas } from "../../API/queries/get";
import { Command } from "../classes/command";

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("get")
        .setDescription("get a manga or a site")
        .addStringOption(option =>
            option
                .setName("manga")
                .setDescription("The manga to get")
                .setAutocomplete(true)
                .setRequired(true)
        ) as SlashCommandBuilder,
    run: async ({ client, interaction }) => {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(console.error);
        }
        
        try {
            const manga = await getMangaFromName(interaction.options.get("manga")?.value as string);
            if (!manga) throw new Error("Manga does not exist");

            const embed = new EmbedBuilder()
                .setTitle(manga.name)
                .setDescription(`Chapter: ${manga.chapter}\nAlert: ${manga.alert}`)
                .addFields(
                    manga.sites.map(site => ({
                        name: site.site,
                        value: " ",
                        inline: true,
                    }))
                )
            
            await interaction.editReply({ embeds: [embed] })
            client.logger(`Got ${JSON.stringify(manga)}.`);
        } catch (error) {
            client.logger(`Failed to get manga: ${(error as Error).message}`);
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

        choices = (await getAllMangas()).map(manga => ({ name: manga.name, value: manga.name }));

        const filtered = choices
            .filter(choice => choice.name.toLowerCase().startsWith(focused.value.toLowerCase()))
            .slice(0, 25);
        await interaction.respond(filtered.map(choice => ({ name: choice.name, value: choice.value })));
    },
});
