# ScrapTS

ScrapTS is a manga chapter tracker: it scrapes reader sites, tells you in Discord when
a new chapter is out, and keeps your AniList progress in sync.

Pages are parsed with `fetch` + [JSDOM](https://github.com/jsdom/jsdom). JSDOM does not
run JavaScript, so sites that render their content client-side fall back to a headless
Chromium through [puppeteer-core](https://pptr.dev/) — see `PUPPETEER_EXECUTABLE_PATH`
below. Without that variable those sites simply fail with an explicit error.

## Installation

```bash
npm install
npm run build
```

Requires **Node 20+**. You also need the companion
[API](https://github.com/The-Geneps-Personnal-Project/ScrapAPI) running.

## Usage

```bash
npm run dev     # run directly
npm run start   # run under forever (deployment)
npm run lint
```

## Environment variables

Copy `.env.example` to `.env` and fill it in. The bot validates its configuration at
startup and refuses to boot with a readable message if something required is missing.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TOKEN` | yes | Discord bot token |
| `GUILD_ID` | yes | Guild the slash commands are deployed to |
| `API_URL` / `API_TEST_URL` | yes | ScrapAPI base URL — which one is used depends on `NODE_ENV` |
| `NODE_ENV` | — | `development` (default) or `production` |
| `UPDATE` / `ERROR` / `BACKUP` | no | Channel IDs used in production |
| `TEST_UPDATE` / `TEST_ERROR` / `TEST_BACKUP` | no | Channel IDs used in development |
| `ANILIST_TOKEN` | no | Needed to push read progress to AniList and to mark must-watch entries PLANNING/CURRENT. The public metadata query is unauthenticated. |
| `THREADS` | no | Scraping worker threads (default 4) |
| `PUPPETEER_EXECUTABLE_PATH` | no | Chromium binary for JavaScript-rendered sites. On a Pi: `apt install chromium-browser`. |

## Discord

Built on [discord.js](https://discord.js.org/) v14 using **Components V2**
(`ContainerBuilder`, `SectionBuilder`, `SeparatorBuilder`), so responses are rich
containers rather than classic embeds.

### Commands

#### `/get`

- `/get manga [manga]` — full card for one manga: cover, description, tags, chapter,
  alert state, last update, AniList link.
- `/get all` — the whole library, paginated, with buttons to page through, a menu to
  sort (name / last update / chapter) and a toggle to show only mangas with alerts on.
- `/get sites` — every registered site.
- `/get must-watch` — the backlog (see below).

#### `/backup`

Posts the daily digest on demand — see [Scheduling and the daily backup](#scheduling-and-the-daily-backup).

#### `/status`

How long until the next scraping pass, whether one is running right now, what the last
one produced, and how many mangas were already notified today.

#### Must-watch backlog

`/create manga … must_watch:True` files an entry as backlog instead of active tracking:
it lives in the same table with `status = must_watch`, is **never scraped and never
raises alerts**, and is marked **PLANNING** on your AniList list. Metadata (tags,
description, cover) and site linking work exactly as for a normal manga.

- `/get must-watch` — list the backlog.
- `/activate [manga] [chapter?]` — promote one to active tracking: alerts on, and marked
  **CURRENT** on AniList. Optionally set the starting chapter.

#### `/create`

- `/create site [url]` — derives the site's URL patterns from its home page, then links
  it against every manga already registered.
- `/create manga [anilist_id] [chapter] [name] [must_watch?]` — creates a manga and links
  it against every registered site. `anilist_id` may be `0` if the manga is not on AniList or you
  do not want to track it. If AniList is unreachable the manga is still created; run
  `/update all` later to backfill the metadata.
- `/create site_to_manga [manga] [site]` — links an existing pair.

#### `/update`

- `/update manga [manga] [key] [value]` — `key` is `alert` or `chapter`.
- `/update site [site] [url]` — re-derives a site's URL patterns.
- `/update all [manga|all]` — links a manga (or every manga) against any site it is not
  yet on, and backfills missing AniList metadata. Above 8 mangas the job is detached and
  reports into the updates channel, because a full pass outlives Discord's 15-minute
  interaction token.

#### `/remove`

- `/remove [manga|site|site_from_manga]`

#### `/run`

Triggers a scraping pass immediately. Runs are mutually exclusive: if one is already in
progress the command says so instead of starting a second.

### Notifications

When several chapters drop at once, the notification reports the full range and links
the **first unread** chapter — reading 505 with 510 out links chapter 506, not 510.

### Autocompletion

Most options autocomplete from your registered mangas and sites, showing 25 entries at a
time and narrowing as you type. Results are cached for 30 seconds so Discord's 3-second
autocomplete deadline is met even on a Raspberry Pi.

## Scheduling and the daily backup

A cron job scrapes every 3 hours between 07:00 and 23:00. At 06:45 the bot posts a
**backup digest** to the backup channel and then clears the updates channel.

The digest lists every chapter updated since the previous reset. Each entry carries an
inline link to its first unread chapter, and below it a dropdown selects one manga while
a link button follows that selection — a link button's URL is fixed at build time, so
the message is rebuilt on each pick.

The dropdown needs in-memory state, so it stops responding after a restart (the message
says so); the inline links keep working regardless.

`/backup` posts the digest immediately, without waiting for 06:45. Pass `reset:True` to
also clear the day's tracking, exactly as the scheduled job does.

Note this replaced an older feature that archived *deleted messages*. Notifications are
Components V2 containers and carry no `content`, so reading `message.content` captured
nothing — the digest is built from recorded update data instead, and no privileged
intent is needed.

## Verification scripts

```bash
npm run build
node scripts/verify-worker-pool.js
node scripts/verify-redirects.js
```

`verify-worker-pool` runs several scraping passes against a local fixture server and
asserts that the process exits on its own afterwards — a leaked worker thread keeps the
Node event loop alive, so a hang is a leak. Its fixture redirects, mirroring production.

`verify-redirects` covers redirect handling on its own. ScrapAPI hands the scraper
`site.url + slug`, which has no trailing slash, and sites 301 to the canonical slashed
form. A build that treats any redirect as "wrong page" finds zero chapters *and reports
zero errors* — silent, total failure. It also checks that a redirect to the site root is
still correctly read as "this manga is not here".

Both run in CI.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what
you would like to change.
