import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "AI DOJO",
  description: "A practical virtual simulation arena for Ugandan learners to practice Japanese through realistic AI role-play: office scenarios, social situations, and daily-life interactions.",
  keywords: [
    "AI Dojo",
    "Japanese Language",
    "Role-Play",
    "Uganda Japan",
    "Language Learning"
  ],
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AI DOJO',
    description: 'Master Japanese through realistic AI role-play scenarios.',
    url: 'https://ai-dojo.app',
    siteName: 'AI DOJO',
    images: [{ url: '/logo.png', width: 512, height: 512 }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'AI DOJO',
    description: 'Master Japanese through realistic AI role-play scenarios.',
    images: ['/logo.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head />
      <body className="min-h-full flex flex-col">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ai-dojo-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
          }}
        />
        <Script
          id="avatar-crypto-shim"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var cryptoApi = globalThis.crypto;
                  if (!cryptoApi || typeof cryptoApi.randomUUID === 'function') return;
                  if (typeof cryptoApi.getRandomValues !== 'function') return;
                  var makeUuid = function() {
                    var bytes = new Uint8Array(16);
                    cryptoApi.getRandomValues(bytes);
                    bytes[6] = (bytes[6] & 0x0f) | 0x40;
                    bytes[8] = (bytes[8] & 0x3f) | 0x80;
                    var hex = Array.from(bytes, function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
                    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
                  };
                  Object.defineProperty(cryptoApi, 'randomUUID', { configurable: true, value: makeUuid });
                  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoApi });
                  Object.defineProperty(window, 'crypto', { configurable: true, value: cryptoApi });
                } catch (e) {}
              })();
            `,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

