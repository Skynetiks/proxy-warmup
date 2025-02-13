import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      const time = new Date(timestamp as string).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });
      return `${time} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: "logs/progress-%DATE%.log", // Daily log file: progress-YYYY-MM-DD.log
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});

export function logEmailWarmupProcess({
  startDate,
  projectedEndDate,
  from,
  recipientsLength,
  maxTargetEmailsPerDay,
}: {
  startDate: Date;
  projectedEndDate: Date;
  from: string;
  recipientsLength: number;
  maxTargetEmailsPerDay: number;
}) {
  console.log(`
  ================================== Skyfunnel Email Warmup Process Initiated ==================================
    Start Date           : ${startDate.toDateString()}
    Projected End Date   : ${projectedEndDate.toDateString()}
    Sender Email         : ${from}
    Number of Recipients : ${recipientsLength}
    Maximum Target Emails/Day: ${maxTargetEmailsPerDay}
  ==============================================================================================================
    `);
}
