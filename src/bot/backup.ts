import { MessageFlags, StringSelectMenuInteraction } from "discord.js";

import CustomClient from "./classes/client";
import { DailyUpdate } from "../types/types";
import { dailyDigest } from "./ui";

/**
 * Daily backup digest posted to the backup channel before the updates channel is
 * cleared.
 *
 * This replaces the previous approach of archiving deleted messages, which read
 * `message.content`. Notifications are Components V2 containers and carry no content
 * at all, so that archive silently captured nothing.
 */

/**
 * Entries behind each posted digest, so the dropdown can rebuild the message with a
 * different chapter link. Held in memory only: the digest also renders every chapter
 * as an inline markdown link, which keeps working after a restart even once this map
 * is empty.
 */
const posted = new Map<string, DailyUpdate[]>();

/** Only the last few digests stay interactive; older ones fall back to their inline links. */
const MAX_TRACKED_DIGESTS = 7;

function remember(messageId: string, entries: DailyUpdate[]): void {
    posted.set(messageId, entries);

    while (posted.size > MAX_TRACKED_DIGESTS) {
        const oldest = posted.keys().next().value;
        if (oldest === undefined) break;
        posted.delete(oldest);
    }
}

/**
 * Posts the digest for the given updates.
 *
 * @returns true when something was posted.
 */
export async function postDailyDigest(client: CustomClient, entries: DailyUpdate[]): Promise<boolean> {
    const channel = client.chans.get("backup");

    if (!channel) {
        client.logger(`No "backup" channel resolved — dropping the digest for ${entries.length} update(s).`);
        return false;
    }

    const ordered = [...entries].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
    const { container, rows } = dailyDigest(ordered, 0, client.user?.id ?? "");

    try {
        const message = await channel.send({
            components: [container, ...rows],
            flags: MessageFlags.IsComponentsV2,
        });

        if (ordered.length > 0) remember(message.id, ordered);

        client.logger(`Posted daily digest with ${ordered.length} update(s).`);
        return true;
    } catch (error) {
        client.logger(`Failed to post the daily digest: ${(error as Error).message}`);
        return false;
    }
}

/** Rebuilds a posted digest around the newly selected manga, so its button follows. */
export async function handleDigestSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const entries = posted.get(interaction.message.id);

    if (!entries) {
        // The bot restarted since this digest was posted. The inline links in the
        // message still work, so say so rather than failing silently.
        await interaction.reply({
            content:
                "Ce backup n'est plus interactif (le bot a redémarré depuis). " +
                "Les liens de chaque chapitre restent cliquables dans le message.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const selected = Number(interaction.values[0]);
    const { container, rows } = dailyDigest(entries, Number.isFinite(selected) ? selected : 0, interaction.user.id);

    await interaction.update({ components: [container, ...rows], flags: MessageFlags.IsComponentsV2 });
}
