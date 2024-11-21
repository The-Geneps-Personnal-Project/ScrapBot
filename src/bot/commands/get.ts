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
                .setDescription((manga.infos?.description.split("<")[0] || "No description") + "\n**Tags**:\n" + manga.infos?.tags.map(tags => tags.name).join(", ") + "\n\n**Sites**:\n" + manga.sites.map(site => site.site).join(", "))
                .addFields(
                    [
                        { name: "Alert", value: String(Boolean(manga.alert!)) , inline: true },
                        { name: "Chapter", value: manga.chapter, inline: true },
                        { name: "Last update", value: manga.last_update || "No data", inline: true },
                        { name: "Anilist ID", value: String(manga.anilist_id), inline: true },
                    ]
                )
                if (manga.infos?.coverImage) embed.setThumbnail(manga.infos?.coverImage)
            
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
