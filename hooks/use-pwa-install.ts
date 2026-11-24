"use client";

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { clearInstallPrompt, getInstallPrompt, isStandalone } from "@/components/install-prompt";

export function usePwaInstall() {
  const [installPromptOpen, setInstallPromptOpen] = useState(false);
  const [canInstallMobile, setCanInstallMobile] = useState(false);
  const [isPwa, setIsPwa] = useState(false);

  useEffect(() => {
    const checkMobileBrowser = () => {
      if (typeof window === "undefined") return;
      const standalone = isStandalone();
      const alreadyInstalled =
        typeof localStorage !== "undefined" && localStorage.getItem("pwa_app_installed") === "true";
      const isInstalledOrPwa = standalone || alreadyInstalled;
      setIsPwa(isInstalledOrPwa);

      if (isInstalledOrPwa && typeof document !== "undefined") {
        document.documentElement.classList.add("is-pwa");
        try {
          localStorage.setItem("pwa_app_installed", "true");
        } catch {
          /* ignore */
        }
      }

      const isMobileWidth = window.innerWidth <= 768;
      setCanInstallMobile(!standalone && isMobileWidth && !alreadyInstalled);

      if (
        !isInstalledOrPwa &&
        isMobileWidth &&
        typeof navigator !== "undefined" &&
        "getInstalledRelatedApps" in navigator
      ) {
        (navigator as any)
          .getInstalledRelatedApps()
          .then((apps: any[]) => {
            if (apps && apps.length > 0) {
              try {
                localStorage.setItem("pwa_app_installed", "true");
              } catch {
                /* ignore */
              }
              document.documentElement.classList.add("is-pwa");
              setIsPwa(true);
              setCanInstallMobile(false);
            }
          })
          .catch(() => {});
      }
    };

    checkMobileBrowser();
    window.addEventListener("resize", checkMobileBrowser);

    const handleInstalled = () => {
      try {
        localStorage.setItem("pwa_app_installed", "true");
      } catch {
        /* ignore */
      }
      if (typeof document !== "undefined") {
        document.documentElement.classList.add("is-pwa");
      }
      setIsPwa(true);
      setCanInstallMobile(false);
      setInstallPromptOpen(false);
    };

    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("atlas-app-installed", handleInstalled);

    return () => {
      window.removeEventListener("resize", checkMobileBrowser);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("atlas-app-installed", handleInstalled);
    };
  }, []);

  const handleHeroInstallClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    let promptEvent = getInstallPrompt();
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
      promptEvent = getInstallPrompt();
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
          clearInstallPrompt();
          setIsPwa(true);
          setCanInstallMobile(false);
          setInstallPromptOpen(false);
        }
        return;
      } catch (err) {
        console.error("Hero direct install error:", err);
      }
    }

    setInstallPromptOpen(true);
  }, []);

  return {
    isPwa,
    canInstallMobile,
    installPromptOpen,
    setInstallPromptOpen,
    handleHeroInstallClick,
  };
}
