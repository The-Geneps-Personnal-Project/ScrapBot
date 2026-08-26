import { Collection, Message, PartialMessage, Snowflake, TextChannel } from "discord.js";

import { Event } from "../classes/events";
import CustomClient from "../classes/client";
import { archiveDeletedMessages, backupEnabled } from "../backup";

export default new Event({
    name: "messageDeleteBulk",
    run: async (client: CustomClient, messages: Collection<Snowflake, Message | PartialMessage>) => {
        if (!backupEnabled()) return;

        const backup = client.chans.get("backup") as TextChannel | undefined;
        if (!backup) return;

        const source = client.chans.get("updates");
        const relevant = [...messages.values()].filter(message => !source || message.channelId === source.id);

        if (relevant.length === 0) return;

        await archiveDeletedMessages(client, backup, relevant);
    },
});
