import { getRandomSender } from "../config.js";
import { env } from "../env.js";
import { sendMail } from "../nodemailer.js";

sendMail("saidiwanshu1880@gmail.com", getRandomSender());