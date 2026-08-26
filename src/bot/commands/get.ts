import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

import { Command } from "../classes/command";
import { getMangaFromName } from "../../API/queries/get";
import { getCachedMangas, getCachedSites } from "../../API/cache";
import { isStringSimilarity } from "../../utils/utils";
import { ListOptions, listControls, mangaCard, mangaListPage, siteListPage } from "../ui";
import { respond, respondError } from "../ui/reply";

export const DEFAULT_LIST_OPTIONS: ListOptions = { page: 0, sort: "name", alertsOnly: false };

/** Builds the paginated library view. Shared with the button/select handler. */
export async function buildMangaList(options: ListOptions, ownerId: string) {
    const mangas = await getCachedMangas();
    const total = options.alertsOnly ? mangas.filter(manga => manga.alert).length : mangas.length;

    return [mangaListPage(mangas, options), ...listControls(options, total, ownerId)];
}

async function showManga(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("manga", true);
    const manga = await getMangaFromName(name);

    if (!manga) throw new Error(`Le manga \`${name}\` n'existe pas.`);

    await respond(interaction, [mangaCard(manga)]);
}

async function showAll(interaction: ChatInputCommandInteraction): Promise<void> {
    await respond(interaction, await buildMangaList(DEFAULT_LIST_OPTIONS, interaction.user.id));
}

async function showSites(interaction: ChatInputCommandInteraction): Promise<void> {
    await respond(interaction, [siteListPage(await getCachedSites())]);
}

const handlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
    manga: showManga,
    all: showAll,
    sites: showSites,
};

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("get")
        .setDescription("Consulter la bibliothèque")
        .addSubcommand(subcommand =>
            subcommand
                .setName("manga")
                .setDescription("Afficher la fiche d'un manga")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("Le manga à afficher")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName("all").setDescription("Afficher toute la liste des mangas, paginée")
        )
        .addSubcommand(subcommand =>
            subcommand.setName("sites").setDescription("Afficher tous les sites enregistrés")
        ) as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        const subcommand = interaction.options.getSubcommand();

        try {
            await handlers[subcommand](interaction);
            client.logger(`Ran get ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to get ${subcommand}: ${(error as Error).message}`);
            await respondError(interaction, error, "Lecture impossible");
        }
    },

    autocomplete: async interaction => {
        const focused = interaction.options.getFocused(true);

        // Uses the same similarity filter as every other command; this one used to be
        // the odd one out with a plain `.includes()`.
        const filtered = (await getCachedMangas())
            .map(manga => ({ name: manga.name, value: manga.name }))
            .filter(choice => isStringSimilarity(choice.name.toLowerCase(), focused.value.toLowerCase()) >= 0.5)
            .slice(0, 25);

        await interaction.respond(filtered);
    },
});
