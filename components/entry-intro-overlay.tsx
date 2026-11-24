"use client";

import { useEffect, useState } from "react";

const INTRO_SHOWN_KEY = "atlas_entry_intro_shown";
const INTRO_DURATION_MS = 920;

export function EntryIntroOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        return;
      }

      if (window.sessionStorage?.getItem(INTRO_SHOWN_KEY) === "1") {
        return;
      }

      const navEntries =
        typeof performance !== "undefined" && typeof performance.getEntriesByType === "function"
          ? (performance.getEntriesByType("navigation") as PerformanceNavigationTiming[])
          : [];
      const navType = navEntries[0]?.type;
      if (navType === "reload" || navType === "back_forward") {
        return;
      }

      window.sessionStorage?.setItem(INTRO_SHOWN_KEY, "1");
    } catch {
      return;
    }

    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, INTRO_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="atlas-entry-intro" aria-hidden="true">
      <div className="atlas-entry-intro-stage">
        <svg
          className="atlas-entry-tri atlas-entry-tri--left"
          viewBox="0 0 56 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="introLogoGradGreen" x1="4" y1="4" x2="40" y2="44">
              <stop stopColor="#5c9b7d" />
              <stop offset="1" stopColor="#245f52" />
            </linearGradient>
          </defs>
          <g transform="translate(28, 28) scale(0.583333) translate(-28, -28)">
            <path d="M4 44 L28 4 L40 24 Z" fill="url(#introLogoGradGreen)" />
          </g>
        </svg>

        <svg
          className="atlas-entry-tri atlas-entry-tri--right"
          viewBox="0 0 56 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="introLogoGradPurple" x1="16" y1="18" x2="52" y2="52">
              <stop stopColor="#9570c7" />
              <stop offset="1" stopColor="#5b3a8c" />
            </linearGradient>
          </defs>
          <g transform="translate(28, 28) scale(0.583333) translate(-28, -28)">
            <path d="M16 52 L36.4 18 L52 44 Z" fill="url(#introLogoGradPurple)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
