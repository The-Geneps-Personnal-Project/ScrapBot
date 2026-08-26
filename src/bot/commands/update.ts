import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";

import { getMangaFromName, getSiteFromName, getAllMangas, getAllSites } from "../../API/queries/get";
import { getCachedMangas, getCachedSites } from "../../API/cache";
import { Command } from "../classes/command";
import { FetchSite } from "../../scrap/seed";
import { updateSiteInfo, updateMangaInfo } from "../../API/queries/update";
import { MangaInfo, ScrapingError, SiteInfo } from "../../types/types";
import { isStringSimilarity } from "../../utils/utils";
import { linkMangaToSites } from "../../scrap/scraping";
import { getMangaInfos } from "../../database/graphql/graphql";
import CustomClient from "../classes/client";
import { COLORS, noticeCard, resultSummary } from "../ui";
import { respond, respondError } from "../ui/reply";

/**
 * Above this many mangas the job is detached: a full pass makes far more HTTP calls
 * than a Discord interaction token (15 minutes) can outlive, so the command
 * acknowledges immediately and reports into the updates channel instead.
 */
const INLINE_LIMIT = 8;

async function changeManga(client: CustomClient, interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("manga", true);
    const key = interaction.options.getString("key", true);
    const value = interaction.options.getString("value", true);

    const manga = await getMangaFromName(name);
    if (!manga) throw new Error(`Le manga \`${name}\` n'existe pas.`);

    if (key === "alert") {
        manga.alert = Number(value) ? 1 : 0;
    } else if (key === "chapter") {
        manga.chapter = value;
    } else {
        // Previously an unknown key silently no-oped but still reported success.
        throw new Error(`Clé inconnue \`${key}\`. Valeurs acceptées : \`alert\`, \`chapter\`.`);
    }

    await updateMangaInfo(manga);

    await respond(interaction, [
        noticeCard("✏️ Manga mis à jour", `**${manga.name}** · \`${key}\` → \`${value}\``, COLORS.success),
    ]);
}

async function changeSite(client: CustomClient, interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("site", true);
    const rawUrl = interaction.options.getString("url", true);

    const site = await getSiteFromName(name);
    if (!site) throw new Error(`Le site \`${name}\` n'existe pas.`);

    const completeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsed = await FetchSite(completeUrl);

    const updated: SiteInfo = {
        id: site.id,
        site: site.site,
        url: parsed.url,
        chapter_url: parsed.chapter_url,
        chapter_limiter: parsed.chapter_limiter,
    };

    await updateSiteInfo(updated);

    await respond(interaction, [
        noticeCard("🌐 Site mis à jour", `**${updated.site}**\n\`${updated.url}\``, COLORS.success),
    ]);
}

interface RefreshReport {
    linked: [string, string[]][];
    enriched: string[];
    failures: ScrapingError[];
    scanned: number;
}

/** Links each manga against any site it is not yet on, and backfills missing AniList infos. */
async function refreshMangas(client: CustomClient, mangas: MangaInfo[], allSites: SiteInfo[]): Promise<RefreshReport> {
    const report: RefreshReport = { linked: [], enriched: [], failures: [], scanned: mangas.length };

    for (const manga of mangas) {
        const newSites = allSites.filter(site => !manga.sites.some(existing => existing.site === site.site));

        if (newSites.length > 0) {
            const [, linked, failures] = await linkMangaToSites(manga, newSites);
            if (linked.length > 0) report.linked.push([manga.name, linked]);
            report.failures.push(...failures);
        }

        const missingInfos =
            !manga.infos?.description || !manga.infos?.coverImage || (manga.infos?.tags?.length ?? 0) === 0;

        if (missingInfos && manga.anilist_id) {
            // AniList calls are globally rate-limited in graphql.ts, so no manual sleep
            // is needed here — the old fixed 7.5s pause per manga is what pushed long
            // runs past the interaction token's lifetime.
            const infos = await getMangaInfos(manga.anilist_id);

            if (infos) {
                manga.infos = infos;
                await updateMangaInfo(manga);
                report.enriched.push(manga.name);
            }
        }
    }

    return report;
}

function reportComponents(report: RefreshReport) {
    const items = report.linked.map(([manga, sites]) => `**${manga}** → ${sites.join(", ")}`);

    const summary = [
        `**${report.scanned}** manga${report.scanned > 1 ? "s" : ""} analysé${report.scanned > 1 ? "s" : ""}.`,
        report.linked.length > 0
            ? `**${report.linked.length}** avec de nouveaux sites.`
            : "Aucun nouveau site trouvé.",
        report.enriched.length > 0 ? `**${report.enriched.length}** enrichi(s) via AniList.` : "",
    ]
        .filter(Boolean)
        .join(" ");

    return [
        resultSummary(
            "🔄 Mise à jour terminée",
            summary,
            items,
            report.failures,
            report.linked.length > 0 ? COLORS.success : COLORS.neutral
        ),
    ];
}

async function updateMangaAll(client: CustomClient, interaction: ChatInputCommandInteraction): Promise<void> {
    const value = interaction.options.getString("manga", true);
    const allSites = await getAllSites();

    let mangas: MangaInfo[];

    if (value === "all") {
        mangas = await getAllMangas();
    } else {
        const manga = await getMangaFromName(value);
        if (!manga) throw new Error(`Le manga \`${value}\` n'existe pas.`);
        mangas = [manga];
    }

    if (mangas.length === 0) {
        await respond(interaction, [noticeCard("🔄 Rien à faire", "Aucun manga à mettre à jour.", COLORS.neutral)]);
        return;
    }

    if (mangas.length <= INLINE_LIMIT) {
        const report = await refreshMangas(client, mangas, allSites);
        // Always a non-empty payload. The old code sent `[].map(...).join("\n")` — an
        // empty string — straight to channel.send, which Discord rejects with 50006.
        await respond(interaction, reportComponents(report));
        return;
    }

    await respond(interaction, [
        noticeCard(
            "🔄 Mise à jour lancée",
            `**${mangas.length}** mangas à analyser. Cela dépasse la durée de vie d'une interaction Discord : ` +
                "le résultat sera publié dans le salon des mises à jour.",
            COLORS.info
        ),
    ]);

    // Detached on purpose — see INLINE_LIMIT.
    void (async () => {
        try {
            const report = await refreshMangas(client, mangas, allSites);
            const channel = client.chans.get("updates");

            if (channel) {
                await channel.send({ components: reportComponents(report), flags: MessageFlags.IsComponentsV2 });
            } else {
                client.logger(`Update-all finished but no "updates" channel is configured.`);
            }
        } catch (error) {
            client.logger(`Background update-all failed: ${(error as Error).message}`);
        }
    })();
}

const handlers: Record<
    string,
    (client: CustomClient, interaction: ChatInputCommandInteraction) => Promise<void>
> = {
    manga: changeManga,
    site: changeSite,
    all: updateMangaAll,
};

export default new Command({
    builder: new SlashCommandBuilder()
        .setName("update")
        .setDescription("Update a manga or a site")
        .addSubcommand(subcommand =>
            subcommand
                .setName("manga")
                .setDescription("Update a manga")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName("key").setDescription("The key to change").setRequired(true).setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName("value")
                        .setDescription("The value to change")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("site")
                .setDescription("Update a site")
                .addStringOption(option =>
                    option
                        .setName("site")
                        .setDescription("The name of the site")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName("url").setDescription("The url of the site").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("all")
                .setDescription("Link a manga (or all of them) against every known site")
                .addStringOption(option =>
                    option
                        .setName("manga")
                        .setDescription("The name of the manga, or 'all'")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ) as SlashCommandBuilder,

    run: async ({ client, interaction }) => {
        const subcommand = interaction.options.getSubcommand();

        try {
            await handlers[subcommand](client, interaction);
            client.logger(`Updated ${subcommand}.`);
        } catch (error) {
            client.logger(`Failed to update ${subcommand}: ${(error as Error).message}`);
            await respondError(interaction, error, `Mise à jour impossible · ${subcommand}`);
        }
    },

    autocomplete: async interaction => {
        const focused = interaction.options.getFocused(true);
        const subcommand = interaction.options.getSubcommand(false);
        let choices: { name: string; value: string }[] = [];

        if (focused.name === "manga") {
            choices = (await getCachedMangas()).map(manga => ({ name: manga.name, value: manga.name }));
            // "all" is only meaningful for /update all.
            if (subcommand === "all") choices.unshift({ name: "all (tous les mangas)", value: "all" });
        } else if (focused.name === "site") {
            choices = (await getCachedSites()).map(site => ({ name: site.site, value: site.site }));
        } else if (focused.name === "key") {
            choices = ["alert", "chapter"].map(choice => ({ name: choice, value: choice }));
        } else if (focused.name === "value") {
            choices = [
                { name: "true", value: "1" },
                { name: "false", value: "0" },
            ];
        }

        const filtered = choices
            .filter(choice => isStringSimilarity(choice.name.toLowerCase(), focused.value.toLowerCase()) >= 0.5)
            .slice(0, 25);

        await interaction.respond(filtered);
    },
});
