import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Geist_Mono, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { getAppOrigin } from "@/lib/auth/app-origin";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  // Resolves relative og:image / twitter:image URLs. Uses the same origin the
  // auth boundary trusts (APP_ORIGIN), so it stays correct per environment.
  metadataBase: new URL(getAppOrigin()),
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
      className={`${inter.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

