import { ClientEvents } from "discord.js";

import CustomClient from "./client";

export class Event {
    name: keyof ClientEvents;

    /**
     * `any[]` is deliberate: each event declares its own concrete argument types
     * (Message, Interaction, …) and relies on TypeScript's bivariant parameter
     * checking to stay assignable to this shared signature. `unknown[]` would reject
     * every one of them.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run: (client: CustomClient, ...eventArgs: any[]) => void | Promise<void>;

    constructor(options: NonNullable<Event>) {
        Object.assign(this, options);
    }
}
