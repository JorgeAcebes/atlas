import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppTabsShell } from "@/components/app-tabs-shell";

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

import { cookies } from "next/headers";
import type { UserProfile } from "@/components/auth-context";

export const viewport: Viewport = {
  themeColor: "#245f52",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let initialProfile: UserProfile | null = null;
  try {
    const cookieStore = await cookies();
    const rawProfile = cookieStore.get("app_user_profile")?.value;
    if (rawProfile) {
      initialProfile = JSON.parse(decodeURIComponent(rawProfile));
    }
  } catch {
    // Ignore cookie read error (e.g. during static build)
  }

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=swap" rel="stylesheet" />
        <link rel="preload" href="/world-countries.topo.json" as="fetch" crossOrigin="anonymous" />
        <link rel="prefetch" href="/provincias_spain.topo.json" as="fetch" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="application-name" content="Atlas" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__atlasInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__atlasInstallPrompt = e;
                window.dispatchEvent(new CustomEvent('atlas-install-prompt-ready'));
              });
              window.addEventListener('appinstalled', function() {
                window.__atlasInstallPrompt = null;
                window.dispatchEvent(new CustomEvent('atlas-app-installed'));
              });
            `,
          }}
        />
      </head>
      <body>
        <Providers initialProfile={initialProfile}>
          <AppTabsShell>
            {children}
          </AppTabsShell>
        </Providers>
        <svg
          width="0"
          height="0"
          style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="logoGradGreen" x1="8" y1="12" x2="44" y2="52">
              <stop stopColor="#5c9b7d" />
              <stop offset="1" stopColor="#245f52" />
            </linearGradient>
            <linearGradient id="logoGradPurple" x1="20" y1="26" x2="56" y2="60">
              <stop stopColor="#9570c7" />
              <stop offset="1" stopColor="#5b3a8c" />
            </linearGradient>
          </defs>
        </svg>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                var isStandalone = 
                  window.matchMedia('(display-mode: standalone)').matches ||
                  window.matchMedia('(display-mode: fullscreen)').matches ||
                  window.matchMedia('(display-mode: minimal-ui)').matches ||
                  (typeof navigator !== 'undefined' && 'standalone' in navigator && navigator.standalone === true) ||
                  (typeof document !== 'undefined' && document.referrer && document.referrer.indexOf('android-app://') !== -1) ||
                  window.location.search.indexOf('mode=pwa') !== -1;

                if (isStandalone && typeof document !== 'undefined') {
                  document.documentElement.classList.add('is-pwa');
                }

                function registerAtlasSW() {
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/sw.js').then(function(reg) {
                      reg.update();
                    }).catch(function(err) {
                      console.warn('SW registration failed:', err);
                    });
                  }
                }

                if (window.location.hostname === '196-paises.vercel.app') {
                  if (isStandalone) {
                    // Si el usuario lo tiene instalado como PWA antigua, permanece en este origen para evitar la barra verde "fuera de alcance"
                    if (document.readyState === 'complete') {
                      registerAtlasSW();
                    } else {
                      window.addEventListener('load', registerAtlasSW);
                    }
                    var hadControllerStandalone = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
                    var refreshingStandalone = false;
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.addEventListener('controllerchange', function() {
                        if (hadControllerStandalone && !refreshingStandalone) {
                          refreshingStandalone = true;
                          window.location.reload();
                        }
                      });
                    }
                  } else {
                    // Si entra desde navegador web normal, redirige limpiamente al nuevo dominio
                    window.location.replace('https://atlas-log.vercel.app' + window.location.pathname + window.location.search + window.location.hash);
                  }
                } else {
                  registerAtlasSW();
                  var hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
                  var refreshing = false;
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.addEventListener('controllerchange', function() {
                      if (hadController && !refreshing) {
                        refreshing = true;
                        window.location.reload();
                      }
                    });
                  }
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
