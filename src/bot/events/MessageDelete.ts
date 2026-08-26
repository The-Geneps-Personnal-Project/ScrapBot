import { Message, PartialMessage, TextChannel } from "discord.js";

import { Event } from "../classes/events";
import CustomClient from "../classes/client";
import { archiveDeletedMessages, backupEnabled } from "../backup";

export default new Event({
    name: "messageDelete",
    run: async (client: CustomClient, message: Message | PartialMessage) => {
        if (!backupEnabled()) return;

        const backup = client.chans.get("backup") as TextChannel | undefined;
        if (!backup) return;

        // Only archive messages deleted from the updates channel. The original check
        // compared a *message* id against a *channel* id, which is always true, so the
        // handler returned early every single time and the feature never ran.
        const source = client.chans.get("updates");
        if (!source || message.channelId !== source.id) return;

        await archiveDeletedMessages(client, backup, [message]);
    },
});
