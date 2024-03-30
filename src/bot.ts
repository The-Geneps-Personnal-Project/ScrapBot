import { Client, IntentsBitField, EmbedBuilder, TextChannel } from "discord.js";
import { scrapeSiteInfo } from "./scraping";
import { ScrapingResult, MangaInfo, ScrapingError } from "./types";
import { getMangasInfo, setMangasInfo } from "./files";
import { execCommand } from "./process";
import env from "dotenv";

env.config({path: __dirname + "/../.env"});

function setupChannels() : TextChannel[] {
    const ids = [process.env.update_chan, process.env.error_chan, process.env.backup_chan];
    return ids.map(id => client.channels.cache.get(id as string) as TextChannel);
}

async function setUpRepo(channels: TextChannel) {
    await execCommand("git pull").then(() => {
        channels.bulkDelete(100); // Bulk delete the last 100 messages in the update channel
    })
}

async function getBackup(channels: TextChannel) : Promise<Number> {
    const lastmessage = await channels.messages.fetch({limit: 1})
    return Number(lastmessage.first()?.embeds[0].title?.split(" ").filter(Number)[0])
}

async function sendUpdateMessages(
    ResultInfos: ScrapingResult[],
    channel: TextChannel,
) {
    for (const { manga, lastChapter, site } of ResultInfos) {
        await channel.send(
            `${manga.name} : ${manga.chapter} -> ${lastChapter} at ${site.url}`,
        );
    }
}

async function sendErrorMessage(
    ScrapInfos: ScrapingError[],
    channel: TextChannel,
) {
    for (const { name, error, url } of ScrapInfos) {
        await channel.send(`Error scraping ${name} at ${url}: ${error}`);
    }
}

async function initiateScraping(UpChannel: TextChannel, ErrChannel: TextChannel) {
    const mangas: MangaInfo[] = getMangasInfo();

    const [result, errors] = await scrapeSiteInfo(mangas);
    if (errors && errors.length > 0) sendErrorMessage(errors, ErrChannel);
    if (result && result.length > 0) {
        sendUpdateMessages(result, UpChannel);
        setMangasInfo(result);
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
        .setDescription(messages.map(message => `${message.content}`).join('\n'))
        .setColor('#dd5f53')
        .setTimestamp();

    backupchan.send({embeds: [embed]});
});

client.on("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    const channels = setupChannels();
    //Channels[0] is the update channel, Channels[1] is the error channel, Channels[2] is the backup channel
    await setUpRepo(channels[0]);
    await initiateScraping(channels[0], channels[1]);
});

console.log(process.env.token)
client.login(process.env.token);
