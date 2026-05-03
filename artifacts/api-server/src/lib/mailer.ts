import nodemailer from "nodemailer";
import { logger } from "./logger";

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(opts: { to: string; subject: string; body: string }): Promise<string> {
  if (!isSmtpConfigured()) {
    throw new Error(
      "SMTP not configured. Add SMTP_USER (your email) and SMTP_PASS (app password) to your environment secrets."
    );
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: `"Argus" <${process.env.SMTP_USER}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  });

  logger.info({ messageId: info.messageId, to: opts.to }, "Email sent");
  return info.messageId;
}
