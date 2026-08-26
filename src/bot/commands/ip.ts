import ip from "ip";
import { SlashCommandBuilder } from "discord.js";

import { Command } from "../classes/command";
import { COLORS, noticeCard } from "../ui";
import { respond, respondError } from "../ui/reply";

export default new Command({
    builder: new SlashCommandBuilder().setName("ip").setDescription("get IP") as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        try {
            const address = ip.address();
            await respond(interaction, [noticeCard("🖧 Adresse IP", `\`${address}\``, COLORS.info)]);
            client.logger(`IP address retrieved: ${address}`);
        } catch (error) {
            client.logger(`Failed to get IP: ${(error as Error).message}`);
            await respondError(interaction, error, "Lecture IP impossible");
        }
    },
});
