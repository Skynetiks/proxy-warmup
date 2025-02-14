import { setInterval, clearInterval, setTimeout, clearTimeout } from "timers";
import { env } from "./env.js";
import { logEmailWarmupProcess, logger } from "./logger.js";
import type { EmailWarmupConfig, WarmupSchedule } from "./types.js";
import { getRandomSender, Sender, STATUS_LOG_INTERVAL, warmupSchedule } from "./config.js";
import { promises as fsPromises } from "fs";
import { sendMail } from "./nodemailer.js";

export class RecipientManager {
  private recipients: Set<string>;
  private iterator: Iterator<string>;

  constructor(recipients: string[]) {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error("A non-empty array of recipients is required.");
    }
    // Use a Set to ensure uniqueness.
    this.recipients = new Set(recipients);
    this.iterator = this.recipients.values();
  }

  /**
   * Returns the next recipient in a round-robin fashion.
   */
  public getNextRecipient(): string {
    let next = this.iterator.next();
    // When the iterator is done, reset it.
    if (next.done) {
      this.iterator = this.recipients.values();
      next = this.iterator.next();
    }
    return next.value;
  }

  public getSize(): number {
    return this.recipients.size;
  }

  /**
   * Adds a new recipient to the set.
   */
  public addRecipient(recipient: string): void {
    this.recipients.add(recipient);
    // Reset iterator to include the new recipient.
    this.iterator = this.recipients.values();
  }

  /**
   * Removes a recipient from the set.
   */
  public removeRecipient(recipient: string): void {
    this.recipients.delete(recipient);
    // Reset iterator as the set has changed.
    this.iterator = this.recipients.values();
  }

  /**
   * Returns all recipients as an array.
   */
  public getAllRecipients(): string[] {
    return Array.from(this.recipients);
  }
}

export class EmailWarmup {
  private warmupSchedule: WarmupSchedule;
  private startDate: Date;
  private sendEmailFunction: (from: Sender, to: string) => Promise<void>;
  private emailIntervalId: NodeJS.Timeout | null = null;
  private nextDayTimeoutId: NodeJS.Timeout | null = null;
  private dailyEmailCountSent = 0;
  private isRunning = false;
  private recipientManager: RecipientManager | null = null;

  constructor(config: EmailWarmupConfig) {
    const {
      from,
      warmupSchedule,
      startDate = new Date(),
      sendEmailFunction,
    } = config;

    if (!from.email || !from.name) {
      throw new Error("A valid 'from' name & email address is required.");
    }

    if (
      typeof warmupSchedule !== "object" ||
      Object.keys(warmupSchedule).length === 0
    ) {
      throw new Error("A valid warmupSchedule object is required.");
    }

    this.warmupSchedule = warmupSchedule;
    this.startDate = new Date(startDate);
    this.startDate.setHours(0, 0, 0, 0);
    this.sendEmailFunction = sendEmailFunction || this.defaultSendEmail;
  }

  public async loadRecipients(filePath: string): Promise<void> {
    try {
      const data = await fsPromises.readFile(filePath, "utf8");
      const recipients: string[] = JSON.parse(data);
      if (!Array.isArray(recipients)) {
        throw new Error("Invalid recipients file format: expected an array.");
      }
      // Reinitialize the RecipientManager with the new recipients.
      this.recipientManager = new RecipientManager(recipients);
      logger.info(`Loaded ${recipients.length} recipients from ${filePath}.`);
    } catch (error) {
      logger.error(`Failed to load recipients from ${filePath}:`, error);
      throw error;
    }
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
    if (!this.recipientManager) {
      logger.error("Load recipients before starting the warmup.");
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
      recipientsLength: this.recipientManager.getSize(),
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

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();

    // Calculate delay between emails based on time left in the day
    const delayBetweenEmails = Math.floor(timeUntilMidnight / emailsToSend);
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
    const randomSender = getRandomSender();
    try {
      logger.info(
        `Sending ${
          this.dailyEmailCountSent + 1
        }/${this.getEmailsPerDay()} email ${randomSender.name} ${
          randomSender.email
        } to ${recipient}`
      );
      await this.sendEmailFunction(randomSender, recipient);
    } catch (error) {
      logger.error(`Failed to send email to ${recipient}:`, error);
      // Optionally, add retry logic here.
    }
  }

  /**
   * Returns a random recipient from the provided list.
   */
  private getRandomRecipient(): string {
    if (!this.recipientManager) {
      throw new Error("RecipientManager is not initialized.");
    }
    return this.recipientManager.getNextRecipient();
  }

  /**
   * Default email sending function.
   * Replace this with actual email sending logic (e.g., using nodemailer).
   */
  private async defaultSendEmail(
    from: { name: string; email: string },
    to: string
  ): Promise<void> {
    await sendMail(to, from);
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

export function createWarmupSchedule(
  startValue: number,
  increment: number,
  targetEmails: number
): WarmupSchedule {
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

async function main() {
  // Create an instance of the EmailWarmup.
  const emailWarmup = new EmailWarmup({
    from: getRandomSender(),
    warmupSchedule: warmupSchedule,
    startDate: new Date(),
  });

  await emailWarmup.loadRecipients(env.RECIPIENTS_FILE);
  // Start the warmup process.
  emailWarmup.start();

  setInterval(() => {
    emailWarmup.getStatus();
  }, STATUS_LOG_INTERVAL);
}
main()