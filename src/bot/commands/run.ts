import { SlashCommandBuilder } from "discord.js";
import { Command } from "../classes/command";
import { initiateScraping } from "../../scrap/scraping";

export default new Command({
    builder: new SlashCommandBuilder().setName("run").setDescription("Run the scraping process"),
    run: async ({ client, interaction }) => {
        try {
            await interaction.deleteReply();
            await initiateScraping(client);
        } catch (error) {
            await interaction.editReply((error as Error).message);
        }
    },
});
