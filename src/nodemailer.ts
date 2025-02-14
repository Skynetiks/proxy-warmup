import nodemailer from "nodemailer";
import socks from "socks";
import { env } from "./env";
import { logger } from "./logger";

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

  const info = await transporter.sendMail({
    from: from,
    to: to,
    subject: "Hello ✔",
    text: "Hello world?",
  })

  logger.info(`Email sent to ${to} from ${from}`, {
    messageId: info.messageId,
  });

};

