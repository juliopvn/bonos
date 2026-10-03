import { formatMoney } from '../../money';

const shell = (title: string, body: string) => `<!doctype html>
<html lang="es"><body style="margin:0;background:#edefea;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#0e2a2b">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#f8f9f6;border:1px solid #c9d1c8">
<tr><td style="padding:28px 32px 8px;border-bottom:3px double #b7873b">
<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#1f5f5b">Bonos · Mercado de deuda corporativa</div>
<h1 style="margin:10px 0 14px;font-size:22px;font-weight:600">${title}</h1></td></tr>
<tr><td style="padding:20px 32px 32px;font-size:15px;line-height:1.55">${body}</td></tr></table></body></html>`;

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#1f5f5b;color:#fff;padding:12px 22px;text-decoration:none;font-weight:600;display:inline-block">${label}</a></p>`;

export function magicLinkEmail(link: string, ttlMinutes: number) {
  return {
    subject: 'Tu enlace de acceso a Bonos',
    text: `Entra a Bonos con este enlace (válido ${ttlMinutes} minutos, un solo uso): ${link}`,
    html: shell(
      'Tu enlace de acceso',
      `<p>Usa este enlace para entrar. Caduca en ${ttlMinutes} minutos y solo funciona una vez.</p>${button(link, 'Entrar a Bonos')}<p style="font-size:12px;color:#5b6b6a">Si no lo pediste, ignora este correo.</p>`,
    ),
  };
}

export function allocationEmail(p: {
  bondName: string;
  allocatedUnits: number;
  requestedUnits: number;
  priceLabel: string;
  amountCents: number;
  link: string;
}) {
  return {
    subject: `Adjudicación: ${p.bondName}`,
    text: `Se te adjudicaron ${p.allocatedUnits} de ${p.requestedUnits} títulos de ${p.bondName} a ${p.priceLabel}. Importe: ${formatMoney(p.amountCents)}. ${p.link}`,
    html: shell(
      'Adjudicación de tu orden',
      `<p>Se te adjudicaron <strong>${p.allocatedUnits} de ${p.requestedUnits} títulos</strong> de <strong>${p.bondName}</strong> a un precio de ${p.priceLabel}.</p><p>Importe total: <strong>${formatMoney(p.amountCents)}</strong>.</p>${button(p.link, 'Ver mi cartera')}`,
    ),
  };
}

export function alertEmail(p: { title: string; detail: string; link: string }) {
  return {
    subject: `Alerta: ${p.title}`,
    text: `${p.title}. ${p.detail} ${p.link}`,
    html: shell(p.title, `<p>${p.detail}</p>${button(p.link, 'Ver alertas')}`),
  };
}
