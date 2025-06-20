import ip from 'ip';
import { SlashCommandBuilder } from "discord.js";
import { Command } from "../classes/command";

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("ip")
        .setDescription("get IP") as SlashCommandBuilder,
    run: async ({ client, interaction }) => {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(console.error);
        }
        
        try {
            const ipAddress = ip.address();
            await interaction.editReply(`Your IP address is: ${ipAddress}`);
            client.logger(`IP address retrieved: ${ipAddress}`);
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
    }
});

