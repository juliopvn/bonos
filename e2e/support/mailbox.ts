/**
 * Lectura de correos en E2E, con dos implementaciones seleccionadas por E2E_MAILBOX:
 *  - mailhog (local): API de MailHog  GET /api/v2/search
 *  - memory (CI):     GET /api/test/mailbox (solo existe con E2E_MODE=true)
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  createdAt: Date;
}

export interface Mailbox {
  messagesTo(email: string): Promise<Mail[]>;
}

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Decodifica cabeceras MIME "encoded-word" (RFC 2047) en Q o B. */
function decodeHeader(s: string): string {
  return s
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?([QB])\?([^?]*)\?=/gi, (_, enc: string, v: string) =>
      enc.toUpperCase() === 'B'
        ? Buffer.from(v, 'base64').toString('utf8')
        : Buffer.from(
            v
              .replace(/_/g, ' ')
              .replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))),
            'latin1',
          ).toString('utf8'),
    );
}

class MailhogMailbox implements Mailbox {
  constructor(private baseUrl = process.env.MAILHOG_API_URL ?? 'http://localhost:8025') {}

  async messagesTo(email: string): Promise<Mail[]> {
    const res = await fetch(
      `${this.baseUrl}/api/v2/search?kind=to&query=${encodeURIComponent(email)}&limit=50`,
    );
    if (!res.ok) throw new Error(`MailHog respondió ${res.status}`);
    const data = (await res.json()) as {
      items: {
        Created: string;
        Raw: { Data: string };
        Content: { Headers: Record<string, string[]> };
      }[];
    };
    return data.items.map((m) => ({
      to: email,
      subject: decodeHeader(m.Content.Headers.Subject?.[0] ?? ''),
      text: decodeQuotedPrintable(m.Raw.Data),
      createdAt: new Date(m.Created),
    }));
  }
}

class MemoryMailbox implements Mailbox {
  constructor(private baseUrl = process.env.BASE_URL ?? 'http://localhost:3100') {}

  async messagesTo(email: string): Promise<Mail[]> {
    const res = await fetch(`${this.baseUrl}/api/test/mailbox?to=${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error(`/api/test/mailbox respondió ${res.status}`);
    const data = (await res.json()) as {
      items: { to: string; subject: string; text: string; createdAt: string }[];
    };
    return data.items.map((m) => ({ ...m, createdAt: new Date(m.createdAt) }));
  }
}

export const mailbox: Mailbox =
  process.env.E2E_MAILBOX === 'memory' ? new MemoryMailbox() : new MailhogMailbox();

/** Espera (con reintentos) un correo para `email` posterior a `since` que cumpla `match`. */
export async function waitForMail(
  email: string,
  opts: { since: Date; subject?: RegExp; timeoutMs?: number },
): Promise<Mail> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  for (;;) {
    const found = (await mailbox.messagesTo(email))
      .filter((m) => m.createdAt >= opts.since && (!opts.subject || opts.subject.test(m.subject)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`No llegó el correo esperado a ${email}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Extrae el enlace mágico del cuerpo del correo. */
export function magicLinkFrom(mail: Mail): string {
  const m = /https?:\/\/[^\s"'<>]+\/api\/auth\/verify\?token=[^\s"'<>]+/.exec(mail.text);
  if (!m) throw new Error('El correo no contiene un enlace de acceso');
  return m[0];
}

/** Cuántos correos con ese asunto recibió `email` desde `since`. */
export async function countMails(email: string, since: Date, subject: RegExp): Promise<number> {
  return (await mailbox.messagesTo(email)).filter(
    (m) => m.createdAt >= since && subject.test(m.subject),
  ).length;
}
