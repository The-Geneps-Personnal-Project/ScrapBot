import { Message, MessageFlags, PartialMessage, TextChannel } from "discord.js";

import CustomClient from "./classes/client";
import { COLORS, noticeCard } from "./ui";
import { truncate } from "../utils/utils";

/**
 * Message archiving, kept behind an explicit opt-in.
 *
 * Reading `message.content` for anyone else's message requires the **privileged**
 * MessageContent intent, which has to be enabled in the Discord developer portal.
 * Requesting it unconditionally would make the bot fail to log in wherever it is not
 * enabled, so this stays off unless BACKUP_ENABLED=true — at which point
 * `MessageContent` must also be added to the intents in classes/client.ts.
 */
export function backupEnabled(): boolean {
    return process.env.BACKUP_ENABLED === "true";
}

/** Reads the last archive's number so the next one can continue the sequence. */
async function nextBackupNumber(channel: TextChannel): Promise<number> {
    try {
        const recent = await channel.messages.fetch({ limit: 1 });
        const last = recent.first();
        if (!last) return 1;

        // `embeds[0]` used to be dereferenced unguarded, throwing whenever the last
        // message in the channel had no embed.
        const title = last.embeds[0]?.data.title ?? last.content ?? "";
        const parsed = Number(title.replace(/[^0-9]/g, ""));

        return Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1;
    } catch {
        return 1;
    }
}

export async function archiveDeletedMessages(
    client: CustomClient,
    backup: TextChannel,
    messages: (Message | PartialMessage)[]
): Promise<void> {
    const bodies = messages
        .map(message => message.content?.trim())
        .filter((content): content is string => Boolean(content));

    // Without content there is nothing worth archiving, and an empty description
    // would make Discord reject the message outright.
    if (bodies.length === 0) return;

    const number = await nextBackupNumber(backup);

    try {
        await backup.send({
            components: [noticeCard(`Backup n°${number}`, truncate(bodies.join("\n\n"), 3000), COLORS.warning)],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (error) {
        client.logger(`Failed to write backup n°${number}: ${(error as Error).message}`);
    }
}
