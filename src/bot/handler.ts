import { ChatInputCommandInteraction, CommandInteraction } from "discord.js";

import CustomClient from "./classes/client";
import { Event } from "./classes/events";

export function handleEvent(client: CustomClient, event: Event) {
    const avoidException = async (...args: any) => {
        try {
            await event.run(client, ...args);
        } catch (error) {
            console.error(`An error occurred in '${event.name}' event.\n${error}\n`);
        }
    };

    client.on(event.name, avoidException);
}

export async function handleCommand(client: CustomClient, interaction: CommandInteraction) {
    await interaction.deferReply();

    const { commandName } = interaction;
    const command = client.commands.get(commandName);

    if (!command)
        return await interaction.followUp({
            ephemeral: true,
            content: "Command not found.",
        });

    try {
        await command.run({
            client,
            interaction: interaction as ChatInputCommandInteraction,
        });
    } catch (error) {
        console.error(`An error occurred in '${command.builder.name}' command.\n${error}\n`);

        return await interaction.followUp({
            ephemeral: true,
            content: "An error occurred while executing the command.",
        });
    }
}
