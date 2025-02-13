import { createWarmupSchedule, EmailWarmup } from ".";
import { env } from "./env";
import type { WarmupSchedule } from "./types";

export const warmupSchedule: WarmupSchedule = createWarmupSchedule(300, 750, 3000);

export const recipients: string[] = [
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
];

export const fromAddress: string = env.SMTP_USER;

export const STATUS_LOG_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours


