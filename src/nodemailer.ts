import nodemailer from "nodemailer";
import socks from "socks";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { Content } from "./config.js";

export const sendMail = async (to: string, from: string) => {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    debug: true,
    tls: {
      rejectUnauthorized: false, // Only for testing
    },
  });

  if (env.SMTP_PROXY) {
    transporter.set("proxy_socks_module", socks);
    transporter.setupProxy(env.SMTP_PROXY);
  } else {
    logger.error("PROXY IS NOT SET USING DIRECT CONNECTION");
  }

  if(!Content) return logger.error("Content is not loaded");

  const info = await transporter.sendMail({
    from: `Sales <${env.SMTP_SENDER_EMAIL}>`,
    to: to,
    subject: Content.subject,
    text: Content.text,
    html: Content.html,
  })

  logger.info(`Email sent to ${to} from ${from}`, {
    messageId: info.messageId,
  });

};

