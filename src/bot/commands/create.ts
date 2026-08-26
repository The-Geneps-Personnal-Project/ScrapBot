import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

import { MangaInfo } from "../../types/types";
import { FetchSite } from "../../scrap/seed";
import { Command } from "../classes/command";
import { addManga, addSite, addSiteToManga } from "../../API/queries/create";
import { getMangaFromName, getSiteFromName, getAllMangas, getAllSites } from "../../API/queries/get";
import { getCachedMangas, getCachedSites } from "../../API/cache";
import { getMangaInfos } from "../../database/graphql/graphql";
import { linkMangaToSites, linkSiteToMangas } from "../../scrap/scraping";
import { isStringSimilarity } from "../../utils/utils";
import { COLORS, noticeCard, resultSummary } from "../ui";
import { respond, respondError } from "../ui/reply";

async function createSite(interaction: ChatInputCommandInteraction): Promise<void> {
    const rawUrl = interaction.options.getString("url", true);
    const completeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    let hostname: string;
    try {
        // Parsing properly instead of `url.split("/")[2].split(".")[0]`, which threw
        // on any input without a host segment.
        hostname = new URL(completeUrl).hostname;
    } catch {
        throw new Error(`"${rawUrl}" n'est pas une URL valide.`);
    }

    const siteName = hostname.split(".").filter(part => part !== "www")[0];

    // getSiteFromName now returns null when absent, so this check finally means what
    // it reads as. It used to throw on a *new* site and pass through on an existing one.
    if (await getSiteFromName(siteName)) {
        throw new Error(`Le site \`${siteName}\` existe déjà.`);
    }

    const site = await FetchSite(completeUrl);
    await addSite(site);

    const mangas = await getAllMangas();
    const [count, linked, failures] = await linkSiteToMangas(site, mangas);

    await respond(interaction, [
        resultSummary(
            `🌐 ${site.site}`,
            `Site ajouté. **${count}** manga${count > 1 ? "s" : ""} lié${count > 1 ? "s" : ""} sur ${mangas.length} testé${mangas.length > 1 ? "s" : ""}.`,
            linked,
            failures
        ),
    ]);
}

async function createManga(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("name", true);
    const chapter = interaction.options.getString("chapter", true);
    const anilistId = interaction.options.getNumber("anilist_id", true);

    // Existence is checked *before* calling AniList. The old order burned a rate-limited
    // AniList request even for a manga that was already in the database.
    if (await getMangaFromName(name)) {
        throw new Error(`Le manga \`${name}\` existe déjà.`);
    }

    // Returns null rather than throwing when AniList is unreachable: the enrichment is
    // decorative and must not abort creation. This is what made a 403 fatal before.
    const infos = await getMangaInfos(anilistId);

    const manga: MangaInfo = {
        anilist_id: anilistId,
        chapter,
        name,
        sites: [],
        alert: 1,
        ...(infos ? { infos } : {}),
    };

    await addManga(manga);

    const sites = await getAllSites();
    const [count, linked, failures] = await linkMangaToSites(manga, sites);

    const notes: string[] = [];
    if (!infos && anilistId) notes.push("_Infos AniList indisponibles — relancez `/update all` plus tard._");

    await respond(interaction, [
        resultSummary(
            `📕 ${manga.name}`,
            [
                `Manga ajouté. **${count}** site${count > 1 ? "s" : ""} lié${count > 1 ? "s" : ""} sur ${sites.length} testé${sites.length > 1 ? "s" : ""}.`,
                ...notes,
            ].join("\n"),
            linked,
            failures
        ),
    ]);
}

async function createSiteToManga(interaction: ChatInputCommandInteraction): Promise<void> {
    const mangaName = interaction.options.getString("manga", true);
    const siteName = interaction.options.getString("site", true);

    const manga = await getMangaFromName(mangaName);
    if (!manga) throw new Error(`Le manga \`${mangaName}\` n'existe pas.`);

    const site = await getSiteFromName(siteName);
    if (!site) throw new Error(`Le site \`${siteName}\` n'existe pas.`);

    await addSiteToManga(site.site, manga.name);

    await respond(interaction, [
        noticeCard("🔗 Lien créé", `\`${site.site}\` est désormais lié à **${manga.name}**.`, COLORS.success),
    ]);
}

const handlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
    manga: createManga,
    site: createSite,
    site_to_manga: createSiteToManga,
};

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("create")
        .setDescription("Create a manga or a site")
        .addSubcommand(subcommand =>
            subcommand
                .setName("manga")
                .setDescription("Add a manga to the database")
                .addNumberOption(option =>
                    option.setName("anilist_id").setDescription("The Anilist ID (0 if none)").setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("chapter").setDescription("The last read chapter").setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("name").setDescription("The name of the manga").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site")
                .setDescription("Add a site to the database")
                .addStringOption(option =>
                    option.setName("url").setDescription("The url of the site").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site_to_manga")
                .setDescription("Add a site to a manga")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName("site")
                        .setDescription("The name of the site")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ) as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        const subcommand = interaction.options.getSubcommand();

        try {
            await handlers[subcommand](interaction);
            client.logger(`Created ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to create ${subcommand}: ${(error as Error).message}`);
            await respondError(interaction, error, `Création impossible · ${subcommand}`);
        }
    },

    autocomplete: async interaction => {
        const focused = interaction.options.getFocused(true);
        let choices: { name: string; value: string }[] = [];

        if (focused.name === "manga") {
            choices = (await getCachedMangas()).map(manga => ({ name: manga.name, value: manga.name }));
        } else if (focused.name === "site") {
            choices = (await getCachedSites()).map(site => ({ name: site.site, value: site.site }));
        }

        const filtered = choices
            .filter(choice => isStringSimilarity(choice.name.toLowerCase(), focused.value.toLowerCase()) >= 0.5)
            .slice(0, 25);

        await interaction.respond(filtered);
    },
});
