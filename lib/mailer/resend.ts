import { Resend } from 'resend';
import { getEnv } from '../env';
import type { MailMessage } from './index';

let client: Resend | undefined;

export async function sendResend(message: MailMessage): Promise<void> {
  const env = getEnv();
  client ??= new Resend(env.RESEND_API_KEY);
  const { error } = await client.emails.send({ from: env.MAIL_FROM, ...message });
  if (error) throw new Error(`Resend: ${error.message}`);
}
