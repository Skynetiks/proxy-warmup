import { Sender } from "./config";

export interface WarmupSchedule {
  [week: number]: number;
}

export interface EmailWarmupConfig {
  from: Sender;
  warmupSchedule: WarmupSchedule;
  startDate?: Date;
  sendEmailFunction?: (from: Sender, to: string) => Promise<void>;
}
