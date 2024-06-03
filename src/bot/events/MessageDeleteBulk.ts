import { Event } from "../classes/events";
import { TextChannel, EmbedBuilder, Message } from "discord.js";

async function getBackup(channels: TextChannel): Promise<Number> {
    const lastmessage = await channels.messages.fetch({ limit: 1 });
    return Number(lastmessage.first()?.embeds[0].data.title?.replace(/[^0-9]/g, ""));
}

export default new Event({
    name: "messageDeleteBulk",
    run: async (client, messages) => {
        const d = new Date();
        const channel = client.chans.get("backup") as TextChannel;

        const backupNumber = await getBackup(channel);
        const embed = new EmbedBuilder()
            .setTitle(`Backup n°${Number(backupNumber) + 1}`)
            .setDescription((messages as Message[]).map(message => `${message.content}`).join("\n"))
            .setColor("#dd5f53")
            .setTimestamp();

        channel.send({ embeds: [embed] });
    },
});
