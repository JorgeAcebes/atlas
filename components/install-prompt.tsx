"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/scroll-lock";
import { INSTALL_PROMPT_MAX_WIDTH, canDisplayInstallPrompt } from "@/lib/device-utils";

// Key for localStorage
const DISMISS_KEY = "pwa_install_dismissed_v2";

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
  const isMatch = (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (window.navigator as any).standalone === true ||
    (typeof document !== "undefined" && document.documentElement.classList.contains("is-pwa")) ||
    (typeof document !== "undefined" && document.referrer && document.referrer.indexOf("android-app://") !== -1) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("pwa_app_installed") === "true") ||
    window.location.search.indexOf("mode=pwa") !== -1 ||
    window.location.search.indexOf("source=pwa") !== -1
  );
  if (isMatch && typeof localStorage !== "undefined") {
    try { localStorage.setItem("pwa_app_installed", "true"); } catch(e) {}
  }
  return isMatch;
}

export { INSTALL_PROMPT_MAX_WIDTH, canDisplayInstallPrompt };

export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth <= INSTALL_PROMPT_MAX_WIDTH ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
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
  isActive?: boolean;
}

export function InstallPrompt({ manualOpen, onManualClose, isActive = true }: InstallPromptProps = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isApple, setIsApple] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showManualAndroidSteps, setShowManualAndroidSteps] = useState(false);
  const onManualCloseRef = useRef(onManualClose);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    onManualCloseRef.current = onManualClose;
  }, [onManualClose]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  useScrollLock(showPrompt);

  useEffect(() => {
    if (!isActive && showPrompt) {
      clearCloseTimer();
      setShowPrompt(false);
      setClosing(false);
    }
  }, [isActive, showPrompt, clearCloseTimer]);

  useEffect(() => {
    if (!showPrompt) return;
    const handleViewportChange = () => {
      if (!canDisplayInstallPrompt()) {
        clearCloseTimer();
        setShowPrompt(false);
        setClosing(false);
        setShowManualAndroidSteps(false);
        onManualCloseRef.current?.();
      }
    };
    handleViewportChange();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(max-width: ${INSTALL_PROMPT_MAX_WIDTH}px)`)
        : null;
    if (mql) {
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", handleViewportChange);
      } else if (typeof (mql as any).addListener === "function") {
        (mql as any).addListener(handleViewportChange);
      }
    }
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      if (mql) {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", handleViewportChange);
        } else if (typeof (mql as any).removeListener === "function") {
          (mql as any).removeListener(handleViewportChange);
        }
      }
    };
  }, [showPrompt, clearCloseTimer]);

  useEffect(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("pwa_install_dismissed")) {
      try {
        localStorage.removeItem("pwa_install_dismissed");
      } catch {
        /* ignore */
      }
    }

    const isDismissed = () => {
      if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "true") return true;
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("pwa_dismissed_session") === "true") return true;
      return false;
    };

    const handler = (e: Event) => {
      e.preventDefault();
      const pEvent = e as BeforeInstallPromptEvent;
      globalDeferredPrompt = pEvent;
      if (typeof window !== "undefined") {
        (window as any).__atlasInstallPrompt = pEvent;
      }
      setDeferredPrompt(pEvent);
      if (
        isActive &&
        !manualOpen &&
        !isDismissed() &&
        !isStandalone() &&
        canDisplayInstallPrompt() &&
        isMobile()
      ) {
        setShowPrompt(true);
      }
    };

    const handlePromptReady = () => {
      const p = getInstallPrompt();
      if (p) {
        setDeferredPrompt(p);
        setShowManualAndroidSteps(false);
        if (
          isActive &&
          !manualOpen &&
          !isDismissed() &&
          !isStandalone() &&
          canDisplayInstallPrompt() &&
          isMobile()
        ) {
          setShowPrompt(true);
        }
      }
    };

    const handleAppInstalled = () => {
      clearInstallPrompt();
      setDeferredPrompt(null);
      setShowPrompt(false);
      onManualCloseRef.current?.();
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("atlas-install-prompt-ready", handlePromptReady);
    window.addEventListener("atlas-app-installed", handleAppInstalled);

    const existingPrompt = getInstallPrompt();
    if (existingPrompt) {
      setDeferredPrompt(existingPrompt);
    }

    if (manualOpen && isActive) {
      if (!canDisplayInstallPrompt()) {
        onManualCloseRef.current?.();
      } else {
        setIsManual(true);
        if (isIOS()) {
          setIsApple(true);
        }
        setShowPrompt(true);
      }
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
        window.removeEventListener("atlas-app-installed", handleAppInstalled);
      };
    }

    if (!isActive) {
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
        window.removeEventListener("atlas-app-installed", handleAppInstalled);
      };
    }

    // Check if iOS
    if (isIOS()) {
      setIsApple(true);
      if (!isStandalone() && !isDismissed() && canDisplayInstallPrompt()) {
        setShowPrompt(true);
      }
    }

    // If prompt already captured
    if (
      existingPrompt &&
      !manualOpen &&
      !isDismissed() &&
      !isStandalone() &&
      canDisplayInstallPrompt() &&
      isMobile()
    ) {
      setShowPrompt(true);
    }

    // Also show after a short delay for browsers that support PWA
    // but might not fire beforeinstallprompt immediately
    const timer = setTimeout(() => {
      if (!isStandalone() && canDisplayInstallPrompt() && isMobile() && !isDismissed()) {
        if (isIOS()) {
          setIsApple(true);
          setShowPrompt(true);
        } else {
          const p = getInstallPrompt();
          if (p) {
            setDeferredPrompt(p);
            setShowPrompt(true);
          }
        }
      }
    }, 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("atlas-install-prompt-ready", handlePromptReady);
      window.removeEventListener("atlas-app-installed", handleAppInstalled);
      clearTimeout(timer);
    };
  }, [manualOpen, isActive]);

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
        }, 300);
      });
      promptEvent = deferredPrompt || getInstallPrompt();
    }

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") {
          try {
            localStorage.setItem("pwa_app_installed", "true");
          } catch {
            /* ignore */
          }
          setShowPrompt(false);
          onManualCloseRef.current?.();
        }
        setDeferredPrompt(null);
        clearInstallPrompt();
        return;
      } catch (err) {
        console.error("Error prompting install:", err);
      }
    }
    setShowManualAndroidSteps(true);
  }, [deferredPrompt]);

  const handleClose = useCallback(() => {
    clearCloseTimer();
    setClosing(true);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("pwa_dismissed_session", "true");
    }
    clearInstallPrompt();
    if (dontShowAgain && !isManual) {
      localStorage.setItem(DISMISS_KEY, "true");
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setShowPrompt(false);
      setClosing(false);
      setShowManualAndroidSteps(false);
      onManualCloseRef.current?.();
    }, 280);
  }, [dontShowAgain, isManual, clearCloseTimer]);

  useEffect(() => {
    if (!showPrompt) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPrompt, handleClose]);

  if (!showPrompt || !canDisplayInstallPrompt()) return null;

  return (
    <div
      className={`install-prompt-overlay${closing ? " install-prompt-overlay--closing" : ""}`}
      onClick={handleClose}
      onWheel={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div
        className={`install-prompt-dialog${closing ? " install-prompt-dialog--closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Instalar aplicación Atlas"
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="Atlas"
            width={48}
            height={48}
            style={{ display: "block" }}
          />
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
              La aplicación ya está instalada o lista para usar en tu pantalla de inicio.
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
