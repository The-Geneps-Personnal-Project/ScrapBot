import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";

import { MangaInfo, ScrapingError, ScrapingResult, SiteInfo } from "../../types/types";
// `text` is aliased because the Components V2 builder callbacks below bind a
// parameter of that name.
import { compareNames, truncate, text as str } from "../../utils/utils";

/**
 * Every message the bot sends is built here as a Components V2 container.
 *
 * Reminder for callers: a message flagged `MessageFlags.IsComponentsV2` may not carry
 * `content` or `embeds`. Use the `send*` helpers in ./reply so that flag and the
 * components always travel together.
 */

export const COLORS = {
    success: 0x57f287,
    error: 0xed4245,
    info: 0x5865f2,
    warning: 0xfee75c,
    neutral: 0x99aab5,
} as const;

/** Discord caps the combined text of all TextDisplay components in one message. */
const MAX_DESCRIPTION = 700;
const MAX_TAGS = 12;
const MAX_LISTED_ITEMS = 25;

export const LIST_PAGE_SIZE = 10;

const isHttpUrl = (value: string | undefined): value is string =>
    typeof value === "string" && /^https?:\/\//i.test(value);

/** AniList descriptions are HTML fragments; Discord renders markdown, not HTML. */
function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const yesNo = (value: number | undefined) => (value ? "✅ Activée" : "⛔ Désactivée");

/** Renders an ISO timestamp as a Discord relative time, falling back to plain text. */
function relativeTime(iso: string | undefined): string {
    if (!iso) return "—";
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return iso;
    return `<t:${Math.floor(ms / 1000)}:R>`;
}

/** Detail view for a single manga. */
export function mangaCard(manga: MangaInfo): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(COLORS.info);

    const description = manga.infos?.description ? stripHtml(manga.infos.description) : "";
    const body = [
        `## ${str(manga.name, "_sans nom_")}`,
        description ? truncate(description, MAX_DESCRIPTION) : "_Aucune description._",
    ].join("\n");

    const cover = manga.infos?.coverImage;

    if (isHttpUrl(cover)) {
        container.addSectionComponents(section =>
            section
                .addTextDisplayComponents(text => text.setContent(body))
                .setThumbnailAccessory(thumbnail => thumbnail.setURL(cover))
        );
    } else {
        container.addTextDisplayComponents(text => text.setContent(body));
    }

    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(text =>
        text.setContent(
            [
                `**Chapitre** · ${manga.chapter || "—"}`,
                `**Statut** · ${manga.status === "must_watch" ? "📖 Must watch" : "📕 Suivi actif"}`,
                `**Alerte** · ${yesNo(manga.alert)}`,
                `**Dernière MAJ** · ${relativeTime(manga.last_update)}`,
                `**AniList** · ${manga.anilist_id ? `[${manga.anilist_id}](https://anilist.co/manga/${manga.anilist_id})` : "—"}`,
            ].join("\n")
        )
    );

    const tags = (manga.infos?.tags ?? []).map(tag => tag.name).filter(Boolean);
    const sites = manga.sites.map(site => site.site).filter(Boolean);

    if (tags.length || sites.length) {
        container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
        const lines: string[] = [];

        if (sites.length) {
            lines.push(`**Sites (${sites.length})** · ${truncate(sites.join(", "), 400)}`);
        }
        if (tags.length) {
            const shown = tags.slice(0, MAX_TAGS);
            const extra = tags.length > shown.length ? ` _+${tags.length - shown.length}_` : "";
            lines.push(`**Tags** · ${shown.join(" · ")}${extra}`);
        }

        container.addTextDisplayComponents(text => text.setContent(lines.join("\n")));
    }

    return container;
}

export type ListSort = "name" | "updated" | "chapter";

export interface ListOptions {
    page: number;
    sort: ListSort;
    alertsOnly: boolean;
}

export function sortMangas(mangas: MangaInfo[], sort: ListSort): MangaInfo[] {
    const sorted = [...mangas];

    switch (sort) {
        case "updated":
            // Never-updated entries sort last rather than pretending to be the oldest.
            return sorted.sort((a, b) => (Date.parse(b.last_update ?? "") || 0) - (Date.parse(a.last_update ?? "") || 0));
        case "chapter":
            return sorted.sort((a, b) => (parseFloat(b.chapter) || 0) - (parseFloat(a.chapter) || 0));
        default:
            return sorted.sort((a, b) => compareNames(a.name, b.name));
    }
}

/** Paginated overview of the whole collection. */
export function mangaListPage(all: MangaInfo[], options: ListOptions): ContainerBuilder {
    const filtered = options.alertsOnly ? all.filter(manga => manga.alert) : all;
    const sorted = sortMangas(filtered, options.sort);

    const pageCount = Math.max(1, Math.ceil(sorted.length / LIST_PAGE_SIZE));
    const page = Math.min(Math.max(options.page, 0), pageCount - 1);
    const slice = sorted.slice(page * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE + LIST_PAGE_SIZE);

    const container = new ContainerBuilder().setAccentColor(COLORS.info);

    const sortLabel = { name: "nom", updated: "dernière MAJ", chapter: "chapitre" }[options.sort];
    container.addTextDisplayComponents(text =>
        text.setContent(
            `# 📚 Bibliothèque\n**${sorted.length}** manga${sorted.length > 1 ? "s" : ""}` +
                `${options.alertsOnly ? " (alertes actives)" : ""} · trié par ${sortLabel}`
        )
    );

    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));

    if (slice.length === 0) {
        container.addTextDisplayComponents(text =>
            text.setContent(
                options.alertsOnly
                    ? "_Aucun manga avec les alertes activées._"
                    : "_Aucun manga enregistré. Ajoutez-en un avec_ `/create manga`."
            )
        );
        return container;
    }

    const lines = slice.map((manga, index) => {
        const position = page * LIST_PAGE_SIZE + index + 1;
        const alert = manga.alert ? "🔔" : "🔕";
        return (
            `\`${String(position).padStart(3)}\` ${alert} **${str(truncate(manga.name, 60), "_sans nom_")}**\n` +
            `-# ch. ${manga.chapter || "—"} · ${manga.sites.length} site${manga.sites.length > 1 ? "s" : ""} · ${relativeTime(manga.last_update)}`
        );
    });

    container.addTextDisplayComponents(text => text.setContent(lines.join("\n")));
    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text => text.setContent(`-# Page ${page + 1} / ${pageCount}`));

    return container;
}

/**
 * Pagination state lives entirely in the component customIds — there is no collector
 * and no in-memory map. The controls therefore keep working after a bot restart, and
 * nothing needs to be cleaned up when they go idle.
 *
 * Layout: `list:<action>:<page>:<sort>:<alerts>:<ownerId>` (well under the 100-char cap).
 */
export const LIST_ID_PREFIX = "list";

export function encodeListId(action: string, options: ListOptions, ownerId: string): string {
    return [LIST_ID_PREFIX, action, options.page, options.sort, options.alertsOnly ? "1" : "0", ownerId].join(":");
}

export function decodeListId(customId: string): { action: string; options: ListOptions; ownerId: string } | null {
    const [prefix, action, page, sort, alerts, ownerId] = customId.split(":");
    if (prefix !== LIST_ID_PREFIX || !action) return null;

    return {
        action,
        ownerId: ownerId ?? "",
        options: {
            page: Number(page) || 0,
            sort: (["name", "updated", "chapter"] as const).includes(sort as ListSort) ? (sort as ListSort) : "name",
            alertsOnly: alerts === "1",
        },
    };
}

export function listControls(options: ListOptions, total: number, ownerId: string, disabled = false) {
    const pageCount = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
    const page = Math.min(Math.max(options.page, 0), pageCount - 1);

    const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeListId("page", { ...options, page: page - 1 }, ownerId))
            .setLabel("Précédent")
            .setEmoji("◀")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || page === 0),
        new ButtonBuilder()
            .setCustomId(encodeListId("noop", { ...options, page }, ownerId))
            .setLabel(`${page + 1} / ${pageCount}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(encodeListId("page", { ...options, page: page + 1 }, ownerId))
            .setLabel("Suivant")
            .setEmoji("▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || page >= pageCount - 1),
        new ButtonBuilder()
            // Toggling the filter resets to page 0: the current page may not exist in
            // the filtered set.
            .setCustomId(encodeListId("page", { page: 0, sort: options.sort, alertsOnly: !options.alertsOnly }, ownerId))
            .setLabel(options.alertsOnly ? "Tous" : "Alertes seules")
            .setEmoji(options.alertsOnly ? "📚" : "🔔")
            .setStyle(options.alertsOnly ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled)
    );

    const sortOptions: { value: ListSort; label: string; description: string }[] = [
        { value: "name", label: "Nom", description: "Ordre alphabétique" },
        { value: "updated", label: "Dernière mise à jour", description: "Les plus récents d'abord" },
        { value: "chapter", label: "Chapitre", description: "Les plus avancés d'abord" },
    ];

    const sorting = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(encodeListId("sort", { ...options, page: 0 }, ownerId))
            .setPlaceholder("Trier par…")
            .setDisabled(disabled)
            .addOptions(
                sortOptions.map(option =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(option.label)
                        .setDescription(option.description)
                        .setValue(option.value)
                        .setDefault(option.value === options.sort)
                )
            )
    );

    return [navigation, sorting];
}

/** Paginated overview of registered sites. */
export function siteListPage(sites: SiteInfo[]): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(COLORS.info);

    container.addTextDisplayComponents(text =>
        text.setContent(`# 🌐 Sites\n**${sites.length}** site${sites.length > 1 ? "s" : ""} enregistré${sites.length > 1 ? "s" : ""}`)
    );

    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));

    if (sites.length === 0) {
        container.addTextDisplayComponents(text =>
            text.setContent("_Aucun site enregistré. Ajoutez-en un avec_ `/create site`.")
        );
        return container;
    }

    // Rows with a missing name or URL are shown, flagged, rather than hidden: the
    // production `sites` table lost its NOT NULL constraints, so a broken row is
    // something the operator needs to see and repair.
    const lines = [...sites]
        .sort((a, b) => compareNames(a.site, b.site))
        .map(site => {
            const name = str(site.site, "⚠️ _sans nom_");
            const url = str(site.url) ? truncate(site.url, 90) : "⚠️ _sans URL_";
            return `**${name}**\n-# ${url}`;
        });

    const broken = sites.filter(site => !str(site.site) || !str(site.url)).length;

    container.addTextDisplayComponents(text => text.setContent(lines.join("\n")));

    if (broken > 0) {
        container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(text =>
            text.setContent(
                `⚠️ **${broken}** entrée${broken > 1 ? "s" : ""} incomplète${broken > 1 ? "s" : ""} en base — ` +
                    "à supprimer avec `/remove site` ou à corriger avec `/update site`."
            )
        );
    }

    return container;
}

/** Outcome of a create/link operation: a headline plus the items that were linked. */
export function resultSummary(
    title: string,
    subtitle: string,
    items: string[],
    failures: ScrapingError[] = [],
    color: number = COLORS.success
): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(color);

    container.addTextDisplayComponents(text => text.setContent(`## ${title}\n${subtitle}`));

    if (items.length > 0) {
        container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
        const shown = items.slice(0, MAX_LISTED_ITEMS);
        const extra = items.length > shown.length ? `\n-# … et ${items.length - shown.length} de plus` : "";
        container.addTextDisplayComponents(text =>
            text.setContent(truncate(shown.map(item => `• ${item}`).join("\n"), 1500) + extra)
        );
    }

    if (failures.length > 0) {
        container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
        const shown = failures.slice(0, 5);
        container.addTextDisplayComponents(text =>
            text.setContent(
                `⚠️ **${failures.length} échec${failures.length > 1 ? "s" : ""}**\n` +
                    truncate(shown.map(f => `• ${f.name} — ${f.error}`).join("\n"), 800)
            )
        );
    }

    return container;
}

/** New-chapter notification posted to the updates channel. */
export function updateNotification(result: ScrapingResult): ContainerBuilder {
    const from = parseFloat(result.manga.chapter) || 0;
    const latest = parseFloat(result.lastChapter) || 0;
    const next = result.nextChapter ?? result.lastChapter;
    const backlog = Math.max(0, Math.round(latest - from));

    // The button opens `next`, the first unread chapter, even when several dropped at
    // once — jumping straight to the newest would skip everything in between.
    const headline =
        backlog > 1
            ? `**${result.manga.chapter || "?"} → ${result.lastChapter}** · ${backlog} nouveaux chapitres · commencer au **${next}**`
            : `**${result.manga.chapter || "?"} → ${result.lastChapter}**`;

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.success)
        .addTextDisplayComponents(text =>
            text.setContent(`### 📖 ${str(result.manga.name, "?")}\n${headline}\n-# sur ${str(result.site?.site, "?")}`)
        );

    // A link button with a malformed URL makes Discord reject the whole message,
    // so a chapter we could not resolve a URL for degrades to text.
    if (isHttpUrl(result.url)) {
        container.addActionRowComponents(row =>
            row.addComponents(
                new ButtonBuilder()
                    .setLabel(backlog > 1 ? `Lire le chapitre ${next}` : "Lire le chapitre")
                    .setEmoji("🔗")
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.url)
            )
        );
    }

    return container;
}

export function noticeCard(title: string, message: string, color: number = COLORS.info): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(text => text.setContent(`### ${title}\n${truncate(message, 1500)}`));
}

export function errorCard(message: string, title = "Erreur"): ContainerBuilder {
    return noticeCard(`❌ ${title}`, message || "Une erreur inconnue est survenue.", COLORS.error);
}

export interface StatusInfo {
    scheduled: boolean;
    inProgress: boolean;
    nextRun: Date | null;
    upcoming: Date[];
    lastRun: { startedAt: Date; finishedAt: Date; results: number; errors: number } | null;
    dailyFeed: number;
}

/** Discord renders `<t:unix:R>` as a live-updating relative time, client-side. */
const discordRelative = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:R>`;
const discordTime = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:t>`;

export function statusCard(info: StatusInfo): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(info.inProgress ? COLORS.warning : COLORS.info);

    const headline = info.inProgress
        ? "### ⏳ Scraping en cours\nLe prochain passage démarrera après la fin de celui-ci."
        : info.nextRun
          ? `### ⏱️ Prochain scraping\n**${discordRelative(info.nextRun)}** · à ${discordTime(info.nextRun)}`
          : "### ⚠️ Aucun scraping planifié\nLe planificateur n'est pas démarré.";

    container.addTextDisplayComponents(text => text.setContent(headline));
    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));

    const lines: string[] = [];

    if (info.lastRun) {
        const seconds = Math.round((info.lastRun.finishedAt.getTime() - info.lastRun.startedAt.getTime()) / 1000);
        lines.push(
            `**Dernier passage** · ${discordRelative(info.lastRun.finishedAt)} · ${seconds}s` +
                `\n-# ${info.lastRun.results} mise${info.lastRun.results > 1 ? "s" : ""} à jour · ${info.lastRun.errors} erreur${info.lastRun.errors > 1 ? "s" : ""}`
        );
    } else {
        lines.push("**Dernier passage** · aucun depuis le démarrage du bot");
    }

    lines.push(`**Déjà notifiés aujourd'hui** · ${info.dailyFeed} manga${info.dailyFeed > 1 ? "s" : ""}`);

    container.addTextDisplayComponents(text => text.setContent(lines.join("\n")));

    if (info.upcoming.length > 0) {
        container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(text =>
            text.setContent(`-# Ensuite · ${info.upcoming.map(discordTime).join(" · ")}`)
        );
    }

    return container;
}

/** Backlog view: entries kept for later, never scraped and never alerted on. */
export function mustWatchListPage(mangas: MangaInfo[]): ContainerBuilder {
    const backlog = mangas.filter(manga => manga.status === "must_watch").sort((a, b) => compareNames(a.name, b.name));

    const container = new ContainerBuilder().setAccentColor(COLORS.info);

    container.addTextDisplayComponents(text =>
        text.setContent(
            `# 📖 Must watch\n**${backlog.length}** en attente · pas d'alerte, jamais scrapé${backlog.length > 1 ? "s" : ""}`
        )
    );

    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));

    if (backlog.length === 0) {
        container.addTextDisplayComponents(text =>
            text.setContent("_Aucun must watch. Ajoutez-en un avec_ `/create manga must_watch:True`.")
        );
        return container;
    }

    const lines = backlog.slice(0, 30).map((manga, index) => {
        const anilist = manga.anilist_id
            ? ` · [AniList](https://anilist.co/manga/${manga.anilist_id})`
            : "";
        return (
            `\`${String(index + 1).padStart(3)}\` **${str(truncate(manga.name, 60), "_sans nom_")}**\n` +
            `-# ${manga.sites.length} site${manga.sites.length > 1 ? "s" : ""} lié${manga.sites.length > 1 ? "s" : ""}${anilist}`
        );
    });

    container.addTextDisplayComponents(text => text.setContent(lines.join("\n")));

    if (backlog.length > 30) {
        container.addTextDisplayComponents(text => text.setContent(`-# … et ${backlog.length - 30} de plus`));
    }

    container.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text =>
        text.setContent("-# Passez-en un en suivi actif avec `/activate`.")
    );

    return container;
}
