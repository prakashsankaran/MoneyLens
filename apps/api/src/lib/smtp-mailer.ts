import nodemailer from 'nodemailer';
import type { Env } from '../config/env';
import type { Mailer } from './mailer';

/**
 * A mailer for the SMTP account in SMTP_*, or undefined when none is set.
 * A Gmail account works for free: smtp.gmail.com, port 465, the Gmail
 * address and an app password (docs/PASSWORD_RESET.md).
 */
export function createSmtpMailer(env: Env): Mailer | undefined {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return undefined;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const from = env.MAIL_FROM ?? `MoneyLens <${env.SMTP_USER}>`;
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}
