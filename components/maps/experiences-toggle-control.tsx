"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";

export function ExperiencesToggleControl({
  showExperiences,
  setShowExperiences,
}: {
  showExperiences: boolean;
  setShowExperiences: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const lastToggleRef = useRef(0);

  const toggle = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 200) return;
    lastToggleRef.current = now;
    setShowExperiences((prev) => !prev);
  }, [setShowExperiences]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);

    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      toggle();
    };

    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("click", handleClick);
    };
  }, [toggle]);

  return (
    <div
      ref={divRef}
      role="button"
      tabIndex={0}
      className={`leaflet-control leaflet-bar collective-exp-toggle-control ${
        showExperiences ? "collective-exp-toggle-control--active" : ""
      }`}
      style={{
        background: showExperiences ? "#cba6f7" : "white",
        color: showExperiences ? "#11111b" : "#666",
      }}
      title={showExperiences ? "Ocultar experiencias" : "Mostrar experiencias"}
      aria-label={showExperiences ? "Ocultar experiencias" : "Mostrar experiencias"}
      aria-pressed={showExperiences}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    </div>
  );
}
