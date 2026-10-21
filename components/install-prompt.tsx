"use client";

import { useCallback, useEffect, useState } from "react";
import { useScrollLock } from "@/lib/scroll-lock";

// Key for localStorage
const DISMISS_KEY = "pwa_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 700;
}

// Module-level captured prompt event so it isn't lost if fired before component mounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return (window as any).__atlasInstallPrompt || globalDeferredPrompt || null;
}

export function clearInstallPrompt(): void {
  if (typeof window !== "undefined") {
    (window as any).__atlasInstallPrompt = null;
  }
  globalDeferredPrompt = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    (window as any).__atlasInstallPrompt = e;
  });
}

export interface InstallPromptProps {
  manualOpen?: boolean;
  onManualClose?: () => void;
}

export function InstallPrompt({ manualOpen, onManualClose }: InstallPromptProps = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(getInstallPrompt);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isApple, setIsApple] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showManualAndroidSteps, setShowManualAndroidSteps] = useState(false);

  useScrollLock(showPrompt);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const pEvent = e as BeforeInstallPromptEvent;
      globalDeferredPrompt = pEvent;
      if (typeof window !== "undefined") {
        (window as any).__atlasInstallPrompt = pEvent;
      }
      setDeferredPrompt(pEvent);
      if (!manualOpen && localStorage.getItem(DISMISS_KEY) !== "true" && !isStandalone() && isMobile()) {
        setShowPrompt(true);
      }
    };

    const handlePromptReady = () => {
      const p = getInstallPrompt();
      if (p) {
        setDeferredPrompt(p);
        setShowManualAndroidSteps(false);
      }
    };

    const handleAppInstalled = () => {
      clearInstallPrompt();
      setDeferredPrompt(null);
      setShowPrompt(false);
      onManualClose?.();
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("atlas-install-prompt-ready", handlePromptReady);
    window.addEventListener("atlas-app-installed", handleAppInstalled);

    const existingPrompt = getInstallPrompt();
    if (existingPrompt) {
      setDeferredPrompt(existingPrompt);
    }

    if (manualOpen) {
      setIsManual(true);
      if (isIOS()) {
        setIsApple(true);
      }
      setShowPrompt(true);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
        window.removeEventListener("atlas-app-installed", handleAppInstalled);
      };
    }

    // Don't show automatic prompt if:
    // 1. Already installed (standalone mode)
    // 2. User dismissed permanently
    // 3. Not on mobile
    if (isStandalone() || !isMobile() || (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "true")) {
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
        window.removeEventListener("atlas-app-installed", handleAppInstalled);
      };
    }

    // Check if iOS
    if (isIOS()) {
      setIsApple(true);
      setShowPrompt(true);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
        window.removeEventListener("atlas-app-installed", handleAppInstalled);
      };
    }

    // If prompt already captured
    if (existingPrompt) {
      setShowPrompt(true);
    }

    // Also show after a short delay for browsers that support PWA
    // but might not fire beforeinstallprompt immediately
    const timer = setTimeout(() => {
      if (!isStandalone() && isMobile() && localStorage.getItem(DISMISS_KEY) !== "true") {
        if (isIOS()) {
          setIsApple(true);
          setShowPrompt(true);
        }
      }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
      window.removeEventListener("atlas-app-installed", handleAppInstalled);
      clearTimeout(timer);
    };
  }, [manualOpen, onManualClose]);

  const handleInstall = useCallback(async () => {
    let promptEvent = deferredPrompt || getInstallPrompt();
    if (!promptEvent) {
      await new Promise<void>((resolve) => {
        let done = false;
        const onReady = () => {
          if (!done) {
            done = true;
            window.removeEventListener("atlas-install-prompt-ready", onReady);
            resolve();
          }
        };
        window.addEventListener("atlas-install-prompt-ready", onReady);
        setTimeout(() => {
          if (!done) {
            done = true;
            window.removeEventListener("atlas-install-prompt-ready", onReady);
            resolve();
          }
        }, 800);
      });
      promptEvent = deferredPrompt || getInstallPrompt();
    }
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") {
          setShowPrompt(false);
          onManualClose?.();
        }
        setDeferredPrompt(null);
        clearInstallPrompt();
      } catch (err) {
        console.error("Error prompting install:", err);
        setShowManualAndroidSteps(true);
      }
    } else {
      setShowManualAndroidSteps(true);
    }
  }, [deferredPrompt, onManualClose]);

  const handleClose = useCallback(() => {
    setClosing(true);
    if (dontShowAgain && !isManual) {
      localStorage.setItem(DISMISS_KEY, "true");
    }
    setTimeout(() => {
      setShowPrompt(false);
      setClosing(false);
      setShowManualAndroidSteps(false);
      onManualClose?.();
    }, 280);
  }, [dontShowAgain, isManual, onManualClose]);

  if (!showPrompt) return null;

  return (
    <div
      className={`install-prompt-overlay${closing ? " install-prompt-overlay--closing" : ""}`}
      onClick={handleClose}
    >
      <div
        className={`install-prompt-dialog${closing ? " install-prompt-dialog--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="install-prompt-close"
          onClick={handleClose}
          aria-label="Cerrar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* App icon */}
        <div className="install-prompt-icon">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 52 L32 12 L44 32 Z" fill="url(#ipGreen)"/>
            <path d="M20 60 L40.4 26 L56 52 Z" fill="url(#ipPurple)" style={{ mixBlendMode: 'multiply' }}/>
            <defs>
              <linearGradient id="ipGreen" x1="8" y1="12" x2="44" y2="52">
                <stop stopColor="#5c9b7d"/>
                <stop offset="1" stopColor="#245f52"/>
              </linearGradient>
              <linearGradient id="ipPurple" x1="20" y1="26" x2="56" y2="60">
                <stop stopColor="#9570c7"/>
                <stop offset="1" stopColor="#5b3a8c"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Title */}
        <h3 className="install-prompt-title">Atlas</h3>
        <p className="install-prompt-subtitle">
          {isApple
            ? "Añade esta app a tu pantalla de inicio para una mejor experiencia."
            : "¿Quieres instalar la app en tu dispositivo para acceder más rápido y disfrutar de una experiencia completa?"
          }
        </p>

        {/* Install / Instructions */}
        {isApple ? (
          <div className="install-prompt-ios-steps">
            <p>
              Pulsa el botón{" "}
              <span className="install-prompt-share-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </span>{" "}
              <strong>Compartir</strong> y luego <strong>&quot;Añadir a pantalla de inicio&quot;</strong>.
            </p>
          </div>
        ) : showManualAndroidSteps ? (
          <div className="install-prompt-ios-steps">
            <p>
              Pulsa el menú de tu navegador (los tres puntos <strong>⋮</strong>) y selecciona <strong>&quot;Instalar aplicación&quot;</strong> o <strong>&quot;Añadir a pantalla de inicio&quot;</strong>.
            </p>
            <p style={{ marginTop: "10px", fontSize: "12px", opacity: 0.9, lineHeight: 1.45 }}>
              📱 <strong>En Xiaomi / Redmi / POCO:</strong> MIUI/HyperOS bloquea la instalación por defecto. Ve a <em>Ajustes &gt; Aplicaciones &gt; Gestionar aplicaciones &gt; Chrome &gt; Otros permisos</em> y activa <strong>&quot;Accesos directos en la pantalla de inicio&quot;</strong>.
            </p>
          </div>
        ) : (
          <button
            className="button button--green button--wide install-prompt-btn"
            onClick={handleInstall}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Instalar aplicación
          </button>
        )}

        {/* Don't show again checkbox only for automatic prompt */}
        {!isManual && (
          <label className="install-prompt-dismiss">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            No volver a mostrar
          </label>
        )}
      </div>
    </div>
  );
}
