import {
    ActionRowBuilder,
    ButtonBuilder,
    CommandInteraction,
    ContainerBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
} from "discord.js";

import { errorCard } from "./index";

type Row = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;
export type TopLevel = ContainerBuilder | Row;

// Bound to consts so TypeScript keeps the literal enum member types; written inline in
// an object literal they widen to `MessageFlags` and stop matching BitFieldResolvable.
const CV2 = MessageFlags.IsComponentsV2;
const CV2_EPHEMERAL = [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] as const;

/**
 * Single exit point for every command response.
 *
 * Two things it guarantees that the old per-command code did not:
 *
 * 1. It never sends an empty payload. `editReply(undefined)` — which happened
 *    whenever an error object had no usable message — is what produced
 *    "Cannot send an empty message".
 * 2. It picks reply vs. editReply from `deferred || replied`. Every command used to
 *    test `!interaction.replied`, but after `deferReply()` that is still `false`,
 *    so the follow-up branch always won and users saw an empty "thinking" reply
 *    alongside a separate ephemeral message.
 */
export async function respond(interaction: CommandInteraction, components: TopLevel[]): Promise<void> {
    const safe = components.length > 0 ? components : [errorCard("La commande n'a produit aucun contenu à afficher.")];

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ components: safe, flags: CV2 });
    } else {
        await interaction.reply({ components: safe, flags: CV2 });
    }
}

/** Extracts a human-readable message from anything that was thrown. */
export function describeError(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
    return "Une erreur inconnue est survenue.";
}

export async function respondError(interaction: CommandInteraction, error: unknown, title?: string): Promise<void> {
    const container = errorCard(describeError(error), title);

    try {
        await respond(interaction, [container]);
    } catch {
        // The reply may be gone (deleted, or the 15-minute token expired). A follow-up
        // is the last chance to surface the failure to the user.
        await interaction.followUp({ components: [container], flags: CV2_EPHEMERAL }).catch(() => undefined);
    }
}
