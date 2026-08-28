import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Interaction,
    MessageComponentInteraction,
    MessageFlags,
} from "discord.js";

import { Event } from "../classes/events";
import { handleCommand } from "../handler";
import CustomClient from "../classes/client";
import { BACKUP_ID_PREFIX, LIST_ID_PREFIX, ListSort, decodeListId } from "../ui";
import { handleDigestSelection } from "../backup";
import { buildMangaList } from "../commands/get";

/**
 * Drives the paginated /get all view.
 *
 * All state is read back out of the customId, so there is no collector to expire and
 * no per-message state to hold in memory.
 */
async function handleListComponent(client: CustomClient, interaction: MessageComponentInteraction): Promise<void> {
    const decoded = decodeListId(interaction.customId);
    if (!decoded || decoded.action === "noop") return;

    // Only the person who ran the command may drive its pagination.
    if (decoded.ownerId && interaction.user.id !== decoded.ownerId) {
        await interaction.reply({
            content: "Cette liste appartient à quelqu'un d'autre — lancez `/get all` pour la vôtre.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = { ...decoded.options };

    if (decoded.action === "sort" && interaction.isStringSelectMenu()) {
        options.sort = interaction.values[0] as ListSort;
        options.page = 0;
    }

    await interaction.deferUpdate();
    await interaction.editReply({
        components: await buildMangaList(options, decoded.ownerId || interaction.user.id),
        flags: MessageFlags.IsComponentsV2,
    });
}

export default new Event({
    name: "interactionCreate",
    run: async (client, interaction: Interaction) => {
        if (interaction.isChatInputCommand()) {
            await handleCommand(client, interaction as ChatInputCommandInteraction);
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command?.autocomplete) return;

            try {
                await command.autocomplete(interaction as AutocompleteInteraction);
            } catch (error) {
                // Autocomplete has a 3s deadline; a slow API means the token is already
                // gone, so there is nothing to answer with.
                console.error(`Autocomplete failed for '${interaction.commandName}': ${(error as Error).message}`);
            }
            return;
        }

        if (!interaction.isMessageComponent()) return;

        if (interaction.customId.startsWith(`${LIST_ID_PREFIX}:`)) {
            try {
                await handleListComponent(client, interaction);
            } catch (error) {
                console.error(`List component failed: ${(error as Error).message}`);
            }
            return;
        }

        if (interaction.customId.startsWith(`${BACKUP_ID_PREFIX}:`) && interaction.isStringSelectMenu()) {
            try {
                await handleDigestSelection(interaction);
            } catch (error) {
                console.error(`Backup digest selection failed: ${(error as Error).message}`);
            }
        }
    },
});
