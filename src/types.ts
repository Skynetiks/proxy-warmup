export interface WarmupSchedule {
    [week: number]: number;
  }
  
export interface EmailWarmupConfig {
    from: string;
    recipients: string[];
    warmupSchedule: WarmupSchedule;
    startDate?: Date;
    sendEmailFunction?: (from: string, to: string) => Promise<void>;
  }