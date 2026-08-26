import { config } from "dotenv";

config();

import CustomClient from "./classes/client";
import { assertConfig } from "../config";
import { closeBrowser } from "../utils/browser";

// Fail at boot with a readable message rather than deep inside a command later.
assertConfig();

const client = new CustomClient();

async function shutdown(signal: string) {
    console.log(`Received ${signal}, shutting down...`);
    await closeBrowser();
    await client.destroy();
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

client.start().catch(error => {
    console.error("Failed to start the bot:", error);
    process.exit(1);
});
