import { getEnv } from '../env';
import { sendSmtp, pingSmtp } from './smtp';
import { sendResend } from './resend';
import { col, pingDb } from '../db';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const env = getEnv();
  switch (env.MAIL_DRIVER) {
    case 'smtp':
      return sendSmtp(message);
    case 'resend':
      return sendResend(message);
    case 'memory': {
      const mailbox = await col('testMailbox');
      await mailbox.insertOne({ ...message, createdAt: new Date() } as never);
      return;
    }
  }
}

export async function pingMailer(): Promise<void> {
  const env = getEnv();
  if (env.MAIL_DRIVER === 'smtp') return pingSmtp();
  if (env.MAIL_DRIVER === 'memory') return pingDb();
  // Resend: no se hace una llamada real; basta con tener la clave (validada en env).
}
