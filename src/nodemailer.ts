import nodemailer from "nodemailer";
import socks from "socks";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { Content, getRandomSender } from "./config.js";

export const sendMail = async (to: string, from: { name: string; email: string }) => {
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

  // if (env.SMTP_PROXY) {
  //   transporter.set("proxy_socks_module", socks);
  //   transporter.setupProxy(env.SMTP_PROXY);
  // } else {
  //   logger.error("PROXY IS NOT SET USING DIRECT CONNECTION");
  // }

  if(!Content) return logger.error("Content is not loaded");

  const info = await transporter.sendMail({
    from: `${from.name} <${from.email}>`,
    to: to,
    subject: Content.subject,
    text: Content.text,
    replyTo: "hello@skyfunnel.ai"
    // html: Content.html,
  })

  logger.info(`Email sent to ${to} from ${from.name} ${from.email}`, {
    messageId: info.messageId,
  });

};

