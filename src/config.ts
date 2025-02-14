import { env } from "./env.js";
import fs from "fs";
import { convert } from "html-to-text";
import type { WarmupSchedule } from "./types.js";
import { createWarmupSchedule } from "./index.js";

export const warmupSchedule: WarmupSchedule = createWarmupSchedule(
  200,
  200,
  3000
);

export const fromAddress: string = env.SMTP_USER;

export const STATUS_LOG_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

export let Content: {html: string, text: string, subject: string} | null = null;

const loadContent = (): {html: string, text: string} => {
  if (Content === null) {
    const html = fs.readFileSync(
      "src/content/index.html",
      "utf8"
    );

    Content = {
      html,
      text: convert(html),
      subject: "Improve Email Campaign Performance Now!",
    }
  }

  return Content;
};

export function getRandomSender(): string {
  // Read JSON file
  const data = fs.readFileSync("senders.json", "utf8");
  const senders = JSON.parse(data).senders;

  if (!Array.isArray(senders) || senders.length === 0) {
    throw new Error("Sender list is empty or invalid");
  }

  // Select a random sender
  const randomIndex = Math.floor(Math.random() * senders.length);
  return senders[randomIndex];
}


loadContent();

