import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono, Fraunces, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppTabsShell } from "@/components/app-tabs-shell";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://atlas-log.vercel.app"),
  title: "Atlas",
  description: "Registra cada país del mundo que has visitado, los techos provinciales y tus aventuras.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  openGraph: {
    title: "Atlas",
    description: "Registra cada país del mundo que has visitado, los techos provinciales y tus aventuras.",
    url: "https://atlas-log.vercel.app",
    siteName: "Atlas",
    locale: "es_ES",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "Atlas",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Atlas",
    description: "Registra cada país del mundo que has visitado, los techos provinciales y tus aventuras.",
    images: ["/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Atlas",
  },
};

export const viewport: Viewport = {
  themeColor: "#245f52",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const BOOTSTRAP_SCRIPT = `
(function() {
  if (typeof window === 'undefined') return;
  try {
    var isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      ('standalone' in navigator && navigator.standalone === true) ||
      (document.referrer && document.referrer.indexOf('android-app://') !== -1) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('pwa_app_installed') === 'true') ||
      window.location.search.indexOf('mode=pwa') !== -1 ||
      window.location.search.indexOf('source=pwa') !== -1;

    if (isStandalone && typeof document !== 'undefined') {
      document.documentElement.classList.add('is-pwa');
      try { localStorage.setItem('pwa_app_installed', 'true'); } catch(e) {}
    }

    if (window.location.hostname === '196-paises.vercel.app' && !isStandalone) {
      window.location.replace('https://atlas-log.vercel.app' + window.location.pathname + window.location.search + window.location.hash);
      return;
    }

    window.__atlasInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      window.__atlasInstallPrompt = e;
      window.dispatchEvent(new CustomEvent('atlas-install-prompt-ready'));
    });
    window.addEventListener('appinstalled', function() {
      try { localStorage.setItem('pwa_app_installed', 'true'); } catch(e) {}
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add('is-pwa');
      }
      window.__atlasInstallPrompt = null;
      window.dispatchEvent(new CustomEvent('atlas-app-installed'));
    });

    if ('serviceWorker' in navigator) {
      var hadController = !!navigator.serviceWorker.controller;
      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (hadController && !refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
      var registerSW = function() {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
          reg.update();
        }).catch(function(err) {
          console.warn('SW registration failed:', err);
        });
      };
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW, { once: true });
      }
    }
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${dmSans.variable} ${dmMono.variable} ${fraunces.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
        )}
        <link rel="preload" href="/world-countries.topo.json" as="fetch" crossOrigin="anonymous" />
        <link rel="prefetch" href="/provincias_spain.topo.json" as="fetch" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="application-name" content="Atlas" />
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppTabsShell>
            {children}
          </AppTabsShell>
        </Providers>
      </body>
    </html>
  );
}
