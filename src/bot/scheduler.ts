import { CronJob } from "cron";

import CustomClient from "./classes/client";
import { initiateScraping } from "../scrap/scraping";

/**
 * Owns the two recurring jobs, so both the `ready` handler and the /status command
 * read the same state.
 *
 * Module scope is load-bearing: `ready` fires again on every reconnect, and when these
 * lived inside that handler each reconnect started a second scraping scheduler.
 */

/** Every 3 hours between 07:00 and 23:00. */
export const SCRAPING_CRON = "0 7-23/3 * * *";
/** Daily at 06:45, just before the first scraping run of the day. */
export const DAILY_RESET_CRON = "45 6 * * *";

let scrapingJob: CronJob | null = null;
let dailyResetJob: CronJob | null = null;

export function startSchedulers(client: CustomClient, onDailyReset: () => Promise<void>): void {
    if (!scrapingJob) {
        scrapingJob = new CronJob(SCRAPING_CRON, () => {
            void initiateScraping(client);
        });
        scrapingJob.start();
        client.logger(`Scraping scheduler started (${SCRAPING_CRON}).`);
    }

    if (!dailyResetJob) {
        dailyResetJob = new CronJob(DAILY_RESET_CRON, () => {
            void onDailyReset();
        });
        dailyResetJob.start();
        client.logger(`Daily reset scheduler started (${DAILY_RESET_CRON}).`);
    }
}

const nextFor = (job: CronJob | null): Date | null => {
    if (!job?.isActive) return null;
    // cron v4 returns a Luxon DateTime.
    return new Date(job.nextDate().toMillis());
};

export const getNextScrapingRun = (): Date | null => nextFor(scrapingJob);
export const getNextDailyReset = (): Date | null => nextFor(dailyResetJob);

/** The next few scraping times, for context beyond the immediate one. */
export function getUpcomingScrapingRuns(count: number): Date[] {
    if (!scrapingJob?.isActive) return [];
    return scrapingJob.nextDates(count).map(date => new Date(date.toMillis()));
}

export const schedulersRunning = (): boolean => Boolean(scrapingJob?.isActive);
