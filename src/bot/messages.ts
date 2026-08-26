import { MessageFlags } from "discord.js";

import { ScrapingError, ScrapingResult } from "../types/types";
import CustomClient from "./classes/client";
import { errorCard, updateNotification } from "./ui";

export async function sendUpdateMessages(results: ScrapingResult[], client: CustomClient): Promise<void> {
    const channel = client.chans.get("updates");

    if (!channel) {
        // Previously an optional chain swallowed this, so a renamed or unreachable
        // channel silently discarded every notification.
        client.logger(`No "updates" channel resolved — dropping ${results.length} update(s).`);
        return;
    }

    client.logger(`Sending ${results.length} update messages`);

    for (const result of results) {
        try {
            await channel.send({
                components: [updateNotification(result)],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            client.logger(`Failed to post update for ${result.manga.name}: ${(error as Error).message}`);
        }
    }
}

export async function sendErrorMessage(errors: ScrapingError[], client: CustomClient): Promise<void> {
    const channel = client.chans.get("error");

    if (!channel) {
        client.logger(`No "error" channel resolved — dropping ${errors.length} scraping error(s).`);
        return;
    }

    for (const { name, error } of errors) {
        try {
            await channel.send({
                components: [errorCard(String(error), `Échec du scraping · ${name}`)],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (sendError) {
            client.logger(`Failed to post scraping error for ${name}: ${(sendError as Error).message}`);
        }
    }
}
