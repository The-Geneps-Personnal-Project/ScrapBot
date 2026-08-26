import { ChatInputCommandInteraction, CommandInteraction } from "discord.js";

import CustomClient from "./classes/client";
import { Event } from "./classes/events";
import { respondError } from "./ui/reply";

export function handleEvent(client: CustomClient, event: Event) {
    const avoidException = async (...args: unknown[]) => {
        try {
            client.logger(`Running '${event.name}' event.`);
            await event.run(client, ...args);
        } catch (error) {
            console.error(`An error occurred in '${event.name}' event.\n${error}\n`);
        }
    };

    client.on(event.name, avoidException);
}

export async function handleCommand(client: CustomClient, interaction: CommandInteraction) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        await interaction.reply({ ephemeral: true, content: "Command not found." }).catch(() => undefined);
        return;
    }

    // Deferring is centralised here — commands no longer re-defer with their own
    // guard. If it fails the interaction is already gone, so there is nothing to
    // reply to and we bail out rather than throwing into the event handler.
    try {
        await interaction.deferReply();
    } catch (error) {
        client.logger(`Could not defer '${interaction.commandName}': ${(error as Error).message}`);
        return;
    }

    try {
        client.logger(`Running '${command.builder.name}' command.`);
        await command.run({ client, interaction: interaction as ChatInputCommandInteraction });
    } catch (error) {
        console.error(`An error occurred in '${command.builder.name}' command.\n${error}\n`);
        await respondError(interaction, error);
    }
}
