"use client";

import { useEffect, useState } from "react";

export default function Loading() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Solo mostrar la pantalla de carga completa si la navegación o carga
    // realmente se prolonga más de 700ms (evita parpadeos en páginas ya cacheadas o transiciones rápidas)
    const timer = setTimeout(() => {
      setShow(true);
    }, 700);

    return () => clearTimeout(timer);
  }, []);

  if (!show) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--paper, #faf8f1)",
        color: "var(--muted, #62716b)",
        fontFamily: "'DM Sans', sans-serif",
        gap: "1.25rem",
        animation: "fadeIn 0.2s ease-in",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
          animation: "atlasPulse 1.6s ease-in-out infinite",
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M8 52 L32 12 L44 32 Z" fill="url(#loadingGradGreen)" />
          <path d="M20 60 L40.4 26 L56 52 Z" fill="url(#loadingGradPurple)" style={{ mixBlendMode: "multiply" }} />
          <defs>
            <linearGradient id="loadingGradGreen" x1="8" y1="12" x2="44" y2="52">
              <stop stopColor="#5c9b7d" />
              <stop offset="1" stopColor="#245f52" />
            </linearGradient>
            <linearGradient id="loadingGradPurple" x1="20" y1="26" x2="56" y2="60">
              <stop stopColor="#9570c7" />
              <stop offset="1" stopColor="#5b3a8c" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <span
        style={{
          fontSize: "0.85rem",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
          color: "var(--sage, #5c9b7d)",
          fontWeight: 600,
        }}
      >
        Cargando…
      </span>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes atlasPulse {
              0%, 100% {
                transform: scale(0.96);
                opacity: 0.7;
              }
              50% {
                transform: scale(1.08);
                opacity: 1;
              }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `,
        }}
      />
    </div>
  );
}

