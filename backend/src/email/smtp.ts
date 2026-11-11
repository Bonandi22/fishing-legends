import nodemailer from 'nodemailer';
import type { AppConfig } from '../config/env.js';

export interface EmailSender {
  send(mail: { to: string; subject: string; text: string; html: string }): Promise<void>;
  close?(): Promise<void>;
}

export function createSmtpSender(cfg: AppConfig['email']): EmailSender {
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.password ?? '' } : undefined,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: cfg.from, ...mail });
    },
    async close() {
      transport.close();
    },
  };
}
