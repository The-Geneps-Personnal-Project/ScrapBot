import { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";

import { Event } from "../classes/events";
import { handleCommand } from "../handler";

export default new Event({
    name: "interactionCreate",
    run: async (client, interaction: ChatInputCommandInteraction | AutocompleteInteraction) => {
        if (interaction.isCommand()) {
            await handleCommand(client, interaction);
        } else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) return;
            try {
                await command.autocomplete?.(interaction as AutocompleteInteraction);
            } catch (error) {
                console.error(`An error occurred in '${command.builder.name}' command.\n${error}\n`);
            }
        }
    },
});
