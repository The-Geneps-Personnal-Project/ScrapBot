import { SlashCommandBuilder } from '@discordjs/builders';

import CustomClient from './client';
import { ChatInputCommandInteraction, CommandInteraction } from 'discord.js';

export type CommandArgs = {

    client: CustomClient;
    interaction: ChatInputCommandInteraction;
};

export class Command {
    builder: SlashCommandBuilder;

    run: (args: CommandArgs) => any;

    constructor(options: NonNullable<Command>) {
        Object.assign(this, options);
    }
}