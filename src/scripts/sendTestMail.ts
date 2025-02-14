import { env } from "../env.js";
import { sendMail } from "../nodemailer.js";

sendMail("saidiwanshu1880@gmail.com", env.SMTP_SENDER_EMAIL);