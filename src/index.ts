import { setInterval, clearInterval, setTimeout, clearTimeout } from "timers";
import { env } from "./env";
import { logEmailWarmupProcess, logger } from "./logger";
import type { EmailWarmupConfig, WarmupSchedule } from "./types";
import { fromAddress, recipients, STATUS_LOG_INTERVAL, warmupSchedule } from "./config";



export class EmailWarmup {
  private from: string;
  private recipients: string[];
  private warmupSchedule: WarmupSchedule;
  private startDate: Date;
  private sendEmailFunction: (from: string, to: string) => Promise<void>;
  private emailIntervalId: NodeJS.Timeout | null = null;
  private nextDayTimeoutId: NodeJS.Timeout | null = null;
  private dailyEmailCountSent = 0;
  private isRunning = false;

  constructor(config: EmailWarmupConfig) {
    const {
      from,
      recipients,
      warmupSchedule,
      startDate = new Date(),
      sendEmailFunction,
    } = config;

    if (!from) {
      throw new Error("A valid 'from' email address is required.");
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error("A non-empty array of recipients is required.");
    }
    if (
      typeof warmupSchedule !== "object" ||
      Object.keys(warmupSchedule).length === 0
    ) {
      throw new Error("A valid warmupSchedule object is required.");
    }

    this.from = from;
    this.recipients = recipients;
    this.warmupSchedule = warmupSchedule;
    this.startDate = new Date(startDate);
    this.startDate.setHours(0, 0, 0, 0);
    this.sendEmailFunction = sendEmailFunction || this.defaultSendEmail;
  }

  /**
   * Calculates the current warmup week (1-indexed) based on the start date.
   */
  private getCurrentWeek(): number {
    const now = new Date();
    const diffMs = now.getTime() - this.startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
  }

  /**
   * Determines how many emails to send today based on the warmup schedule.
   * If the current week exceeds the schedule, it uses the maximum available.
   */
  private getEmailsPerDay(): number {
    const week = this.getCurrentWeek();
    if (this.warmupSchedule[week]) {
      return this.warmupSchedule[week];
    }
    const maxWeek = Math.max(...Object.keys(this.warmupSchedule).map(Number));
    return this.warmupSchedule[maxWeek];
  }

  private getProjectedEndDate(): Date {
    const totalWeeks = Math.max(
      ...Object.keys(this.warmupSchedule).map(Number)
    );
    const endDate = new Date(this.startDate);
    endDate.setDate(this.startDate.getDate() + totalWeeks * 7);
    return endDate;
  }

  /**
   * Starts the email warmup process.
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("Email warmup is already running.");
      return;
    }
    this.isRunning = true;

    // Check if the start date is in the past
    if (this.startDate.getDate() < new Date().getDate()) {
      logger.error(
        "Start date is in the past. Please provide a valid start date."
      );
      return;
    }

    // Suggest to start the warmup in the morning
    if (this.startDate.getHours() < 10) {
      logger.warn(
        "It is recommended to start the warmup process in the morning. OVERRIDE THIS BY SETTING `RECOMMENDED` to false in .env"
      );
      if (env.RECOMMENDED) process.exit(0);
    }

    // Log detailed information about the warmup process
    const projectedEndDate = this.getProjectedEndDate();
    const maxTargetEmailsPerDay = Math.max(
      ...Object.values(this.warmupSchedule)
    );
    

    logEmailWarmupProcess({
      startDate: this.startDate,
      projectedEndDate: projectedEndDate,
      from: this.from,
      recipientsLength: this.recipients.length,
      maxTargetEmailsPerDay: maxTargetEmailsPerDay,
    });

    this.scheduleEmailsForToday();
  }

  /**
   * Stops the email warmup process and clears all scheduled timers.
   */
  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.emailIntervalId) {
      clearInterval(this.emailIntervalId);
      this.emailIntervalId = null;
    }
    if (this.nextDayTimeoutId) {
      clearTimeout(this.nextDayTimeoutId);
      this.nextDayTimeoutId = null;
    }
    logger.info("Email warmup process stopped.");
  }

  /**
   * Schedules the sending of emails for the current day.
   * Divides the 24-hour period by the email count to determine the interval.
   */
  private scheduleEmailsForToday(): void {
    const emailsToSend = this.getEmailsPerDay();
    logger.info(
      `Week ${this.getCurrentWeek()}: Scheduling ${emailsToSend} emails for today.`
    );
    this.dailyEmailCountSent = 0;

    if (emailsToSend <= 0) {
      logger.error("Email count per day is non-positive. Skipping today.");
      this.scheduleNextDay();
      return;
    }

    // Calculate delay between emails (in ms). Ensure a minimum delay of 1 second.
    const delayBetweenEmails = Math.floor((24 * 60 * 60 * 1000) / emailsToSend);
    const effectiveDelay = Math.max(delayBetweenEmails, 1000);

    this.emailIntervalId = setInterval(async () => {
      if (this.dailyEmailCountSent >= emailsToSend) {
        if (this.emailIntervalId) {
          clearInterval(this.emailIntervalId);
          this.emailIntervalId = null;
        }
        logger.info("Completed today's scheduled emails.");
        this.scheduleNextDay();
        return;
      }

      try {
        await this.sendRandomEmail();
        this.dailyEmailCountSent++;
      } catch (error) {
        logger.error("Error during email sending:", error);
      }
    }, effectiveDelay);
  }

  /**
   * Schedules the next day's email sending at the upcoming midnight.
   */
  private scheduleNextDay(): void {
    if (!this.isRunning) return;
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();
    logger.info(`Next day's emails will start in ${timeUntilMidnight} ms.`);
    this.nextDayTimeoutId = setTimeout(() => {
      this.scheduleEmailsForToday();
    }, timeUntilMidnight);
  }

  /**
   * Sends an email to a randomly chosen recipient.
   */
  private async sendRandomEmail(): Promise<void> {
    const recipient = this.getRandomRecipient();
    try {
      logger.info(
        `Sending ${
          this.dailyEmailCountSent + 1
        }/${this.getEmailsPerDay()} email ${this.from} to ${recipient}`
      );
      await this.sendEmailFunction(this.from, recipient);
    } catch (error) {
      logger.error(`Failed to send email to ${recipient}:`, error);
      // Optionally, add retry logic here.
    }
  }

  /**
   * Returns a random recipient from the provided list.
   */
  private getRandomRecipient(): string {
    const index = Math.floor(Math.random() * this.recipients.length);
    return this.recipients[index];
  }

  /**
   * Default email sending function.
   * Replace this with actual email sending logic (e.g., using nodemailer).
   */
  private async defaultSendEmail(from: string, to: string): Promise<void> {
    // await sendMail(to, from)
  }

  /**
   * Returns a status object for use with an HTTP endpoint.
   */
  public getStatus(): {
    isRunning: boolean;
    currentWeek: number;
    emailsPerDay: number;
    emailsSentToday: number;
    remainingEmailsToday: number;
  } {
    const currentWeek = this.getCurrentWeek();
    const emailsPerDay = this.getEmailsPerDay();
    const remainingEmails = emailsPerDay - this.dailyEmailCountSent;

    logger.info(
      `============================== STATUS ==============================`
    );
    logger.info(`Status: ${this.isRunning ? "Running" : "Stopped"}`);
    logger.info(`Current Week: ${currentWeek}`);
    logger.info(`Emails Per Day: ${emailsPerDay}`);
    logger.info(`Emails Sent Today: ${this.dailyEmailCountSent}`);
    logger.info(`Remaining Emails Today: ${remainingEmails}`);
    logger.info(
      `====================================================================`
    );

    return {
      isRunning: this.isRunning,
      currentWeek,
      emailsPerDay,
      emailsSentToday: this.dailyEmailCountSent,
      remainingEmailsToday: remainingEmails,
    };
  }
}

export function createWarmupSchedule(startValue:number, increment: number, targetEmails: number): WarmupSchedule {
  const warmupSchedule: WarmupSchedule = {};
  let week = 1;
  let currentEmailCount = startValue;

  while (currentEmailCount <= targetEmails) {
    warmupSchedule[week] = currentEmailCount;
    week++;
    currentEmailCount += increment;
  }

  // Ensure the last week reaches exactly the targetEmails count
  if (currentEmailCount - increment < targetEmails) {
    warmupSchedule[week] = targetEmails;
  }

  return warmupSchedule;

}



// Create an instance of the EmailWarmup.
const emailWarmup = new EmailWarmup({
  from: fromAddress,
  recipients: recipients,
  warmupSchedule: warmupSchedule,
  startDate: new Date(),
});

// Start the warmup process.
emailWarmup.start();


setInterval(() => {
  emailWarmup.getStatus();
}, STATUS_LOG_INTERVAL);
