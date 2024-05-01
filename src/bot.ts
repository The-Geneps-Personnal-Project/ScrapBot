import { Client, IntentsBitField, EmbedBuilder, TextChannel } from "discord.js";
import env from "dotenv";
import { CronJob } from "cron";
import { scrapeSiteInfo } from "./scraping";
import { ScrapingResult, MangaInfo, ScrapingError } from "./types";
import { getMangasInfo, setMangasInfo } from "./files";
import { updateList } from "./graphql";

env.config({ path: __dirname + "/../.env" });

async function setupChannels(): Promise<TextChannel[]> {
    const ids = [process.env.update_chan, process.env.error_chan, process.env.backup_chan];
    const channels = await Promise.all(
        ids.map(async id => {
            try {
                return await client.channels.fetch(id as string);
            } catch (error) {
                console.error(`Failed to fetch channel ${id}:`, error);
                return undefined;
            }
        })
    );
    return channels.filter(channel => channel !== undefined) as TextChannel[];
}

async function getBackup(channels: TextChannel): Promise<Number> {
    const lastmessage = await channels.messages.fetch({ limit: 1 });
    return Number(lastmessage.first()?.embeds[0].data.title?.replace(/[^0-9]/g, ""));
}

async function sendUpdateMessages(ResultInfos: ScrapingResult[], channel: TextChannel) {
    for (const { manga, lastChapter, site } of ResultInfos) {
        await channel.send(
            `${manga.name} : ${manga.chapter} -> ${lastChapter} at <${site.chapter_url + site.chapter_limiter + (+manga.chapter + 1)}>`
        );
    }
}

async function sendErrorMessage(ScrapInfos: ScrapingError[], channel: TextChannel) {
    for (const { name, error } of ScrapInfos) {
        await channel.send(`Error scraping ${name}: ${error}`);
    }
}

async function initiateScraping(UpChannel: TextChannel, ErrChannel: TextChannel) {
    const mangas: MangaInfo[] = await getMangasInfo();

    const [result, errors] = await scrapeSiteInfo(mangas);
    if (errors && errors.length > 0) sendErrorMessage(errors, ErrChannel);
    if (result && result.length > 0) {
        await sendUpdateMessages(result, UpChannel);
        setMangasInfo(result);
        await updateList(result);
    } else {
        UpChannel.send("No new chapters found.");
    }
}

const client = new Client({ intents: [IntentsBitField.Flags.GuildMessages] });

client.on("messageDeleteBulk", async messages => {
    const backupchan = client.channels.cache.get(process.env.backup_chan as string) as TextChannel;
    const d = new Date();

    const backupNumber = await getBackup(backupchan);
    const embed = new EmbedBuilder()
        .setTitle(`Backup n°${Number(backupNumber) + 1}`)
        .setDescription(messages.map(message => `${message.content}`).join("\n"))
        .setColor("#dd5f53")
        .setTimestamp();

    backupchan.send({ embeds: [embed] });
});

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    const args = message.content.split(" ");

    if (args[0] === "!add_site") {
        if (args.length !== 2) {
            message.reply("Help: !add_site <url>");
            return;
        }

        message.reply(`Added ${args[1].split("/")[2]} to the list.`);
    }
})

client.on("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    const channels = await setupChannels();
    //Channels[0] is the update channel, Channels[1] is the error channel, Channels[2] is the backup channel
    const crontab = new CronJob("0 21 * * *", async () => { // Every day at 9pm (+1h with the server timezone)
        await channels[0].bulkDelete(100);
        await initiateScraping(channels[0], channels[1]);
    });

    if (!crontab.running) crontab.start();
});

client.login(process.env.token);
