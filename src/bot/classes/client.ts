import { Client, Collection, TextChannel } from "discord.js";
import requireAll from "require-all";
import path from "path";

import { handleEvent } from "../handler";
import { Command } from "./command";
import { Event } from "./events";

export default class CustomClient extends Client {
    commands: Collection<string, Command> = new Collection();
    chans: Collection<string, TextChannel> = new Collection();

    constructor() {
        super({
            intents: ["Guilds", "GuildMembers", "GuildMessages"],
        });
    }

    async start() {
        await this.resolveModules();
        await this.login(process.env.TOKEN);
        await this.resolveChannels();
    }

    async resolveChannels() {
        const ids =
            process.env.NODE_ENV === "production"
                ? [process.env.UPDATE, process.env.ERROR, process.env.BACKUP]
                : [process.env.TEST_UPDATE, process.env.TEST_ERROR, process.env.TEST_BACKUP];

        for (const id of ids) {
            const chan = (await this.channels.fetch(id!)) as TextChannel;
            this.chans.set(chan.name, chan);
        }
    }

    logger(message: string) {
        console.log(`[${new Date().toLocaleString()}] ${message}`);
    }

    async resolveModules() {
        const sharedSettings = {
            recursive: true,
            filter: /\w*.[tj]s/g,
        };

        // Commands
        requireAll({
            ...sharedSettings,
            dirname: path.join(__dirname, "../commands"),
            resolve: x => {
                const command = x.default as Command;
                this.logger(`Command '${command.builder.name}' registered.`);
                this.commands.set(command.builder.name, command);
            },
        });

        // Events
        requireAll({
            ...sharedSettings,
            dirname: path.join(__dirname, "../events"),
            resolve: x => {
                const event = x.default as Event;
                this.logger(`Event '${event.name}' registered.`);
                handleEvent(this, event);
            },
        });
    }

    async deployCommands() {
        const guild = this.guilds.cache.get(process.env.GUILD_ID!)!;
        const commandsJSON = [...this.commands.values()].map(x => x.builder.toJSON());
        const commandsCol = await guild.commands.set(commandsJSON);
        console.log(`Deployed ${commandsCol.size} commands.`);
    }
}
