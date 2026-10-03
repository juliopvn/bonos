import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from '../env';
import type { MailMessage } from './index';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const env = getEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      ignoreTLS: true,
    });
  }
  return transporter;
}

export async function sendSmtp(message: MailMessage): Promise<void> {
  await getTransporter().sendMail({ from: getEnv().MAIL_FROM, ...message });
}

export async function pingSmtp(): Promise<void> {
  await getTransporter().verify();
}
