import { Interaction } from "discord.js";

import { Event } from "../classes/events";
import { handleCommand } from "../handler";

export default new Event({
    name: "interactionCreate",
    run: async (client, interaction: Interaction) => {
        if (interaction.isCommand()) {
            await handleCommand(client, interaction);
        }
    },
});
