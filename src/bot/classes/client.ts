import { Client, Collection, TextChannel } from "discord.js";
import requireAll from "require-all";
import path from "path";

import { handleEvent } from "../handler";
import { Command } from "./command";
import { Event } from "./events";

export type ChannelKey = "updates" | "error" | "backup";

export default class CustomClient extends Client {
    commands: Collection<string, Command> = new Collection();
    /** Keyed by role, not by Discord channel name — renaming a channel no longer breaks lookups. */
    chans: Collection<ChannelKey, TextChannel> = new Collection();
    dailyFeed: string[] = [];

    constructor() {
        super({
            intents: ["Guilds", "GuildMembers", "GuildMessages"],
        });
    }

    async start() {
        await this.resolveModules();
        await this.login(process.env.TOKEN);
    }

    /**
     * Resolves the three working channels from their configured IDs.
     *
     * Called from the `ready` handler rather than from `start()`: `ready` fires
     * *during* login, so resolving afterwards left every early channel lookup racing
     * against an empty collection.
     */
    async resolveChannels() {
        const isProduction = process.env.NODE_ENV === "production";

        const configured: Record<ChannelKey, string | undefined> = isProduction
            ? { updates: process.env.UPDATE, error: process.env.ERROR, backup: process.env.BACKUP }
            : { updates: process.env.TEST_UPDATE, error: process.env.TEST_ERROR, backup: process.env.TEST_BACKUP };

        for (const [key, id] of Object.entries(configured) as [ChannelKey, string | undefined][]) {
            if (!id) {
                this.logger(`No channel ID configured for '${key}' — that feature is disabled.`);
                continue;
            }

            try {
                const channel = await this.channels.fetch(id);

                if (channel?.isTextBased()) {
                    this.chans.set(key, channel as TextChannel);
                } else {
                    this.logger(`Channel ${id} for '${key}' is not a text channel.`);
                }
            } catch (error) {
                this.logger(`Failed to resolve '${key}' channel ${id}: ${(error as Error).message}`);
            }
        }
    }

    logger(message: string) {
        console.log(`[${new Date().toLocaleString()}] ${message}`);
    }

    async resolveModules() {
        const sharedSettings = {
            recursive: true,
            filter: /\w*\.[tj]s/g,
        };

        requireAll({
            ...sharedSettings,
            dirname: path.join(__dirname, "../commands"),
            resolve: x => {
                const command = x.default as Command;
                this.logger(`Command '${command.builder.name}' registered.`);
                this.commands.set(command.builder.name, command);
            },
        });

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
        const guildId = process.env.GUILD_ID;
        if (!guildId) throw new Error("GUILD_ID is not set — cannot deploy slash commands.");

        const guild = await this.guilds.fetch(guildId);
        const commandsJSON = [...this.commands.values()].map(command => command.builder.toJSON());
        const deployed = await guild.commands.set(commandsJSON);

        this.logger(`Deployed ${deployed.size} commands.`);
    }
}
