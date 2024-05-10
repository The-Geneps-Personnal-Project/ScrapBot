import {REST, Routes} from "discord.js"
import fs from "fs"
import path from "path";

async function getCommannds(): Promise<unknown[]> {
    const commands = [];
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));

    for (const file of commandFolders) {
        const filePath = path.join(foldersPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    return commands
}

export async function deploy(): Promise<void> {
    try {
        const token = process.env.token as string;
        const clientId = process.env.clientId as string;
        const guildId = process.env.guildId as string;

        const rest = new REST().setToken(token);

        const commands = await getCommannds();
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        ) as Array<unknown>;

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
};