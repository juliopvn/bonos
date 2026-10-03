import type { Metadata } from 'next';
import { Gloock, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const gloock = Gloock({ subsets: ['latin'], weight: '400', variable: '--font-gloock', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const plex = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Bonos — Emisión y gestión de deuda corporativa', template: '%s · Bonos' },
  description: 'Estructura emisiones, gestiona el libro de órdenes y sigue tu cartera de bonos corporativos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${gloock.variable} ${hanken.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
