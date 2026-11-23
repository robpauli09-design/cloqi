import type { Metadata, Viewport } from 'next';
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// next/font downloads the fonts at build time and serves them from our own domain –
// no request to Google from the user's browser (DSGVO).
const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Fredoka({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'CLOQI – Your day. Your flow.', template: '%s · CLOQI' },
  description: 'CLOQI ist dein Kalender, der mitdenkt: Stundenplan, Termine, Lernzeiten und Freizeit an einem Ort – automatisch organisiert.',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon-192.png', type: 'image/png', sizes: '192x192' }, { url: '/icon-512.png', type: 'image/png', sizes: '512x512' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = { themeColor: '#19451F', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
