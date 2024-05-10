import { ClientEvents } from 'discord.js';

import CustomClient from './client';

export class Event {
    name!: keyof ClientEvents;
    run!: (client: CustomClient, ...eventArgs: any) => any;
    constructor(options: NonNullable<Event>) {
        Object.assign(this, options);
    }
}