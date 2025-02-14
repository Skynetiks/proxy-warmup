import { env } from "./env";
import fs from "fs";
import { convert } from "html-to-text";
import path from "path";
import type { WarmupSchedule } from "./types";
import { createWarmupSchedule } from ".";

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

loadContent();

