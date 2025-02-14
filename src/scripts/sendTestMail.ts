import { env } from "../env";
import { sendMail } from "../nodemailer";

sendMail("saidiwanshu1880@gmail.com", env.SMTP_SENDER_EMAIL);