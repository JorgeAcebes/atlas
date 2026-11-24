import type React from "react";

export function parsePanelHash(hash: string): { baseId: string; subItemId?: string } | null {
  if (!hash.startsWith("#panel=")) return null;
  const rawId = hash.slice(7);
  if (!rawId) return null;
  let decoded = rawId;
  try {
    decoded = decodeURIComponent(rawId);
  } catch {
    /* keep rawId on malformed encoding */
  }
  if (decoded.includes("::")) {
    const [baseId, subItemId] = decoded.split("::");
    return { baseId, subItemId };
  }
  return { baseId: decoded };
}

export function buildPanelHash(id: string): string {
  return `#panel=${encodeURIComponent(id)}`;
}

export function scrollToMap(e?: React.MouseEvent): void {
  if (e) e.preventDefault();
  if (typeof window === "undefined") return;

  const mapaEl = document.getElementById("mapa");
  if (mapaEl) {
    const topbar = document.querySelector(".topbar") as HTMLElement | null;
    const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 76;
    const mapaTop = mapaEl.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(0, Math.round(mapaTop - topbarHeight - 6)),
      behavior: "smooth",
    });
  }
  if (window.location.hash !== "#mapa") {
    window.history.replaceState(null, "", "#mapa");
  }
}

export function scrollToTopSmooth(): void {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
