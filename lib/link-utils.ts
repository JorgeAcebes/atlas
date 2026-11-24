export function getLinkPlaceholders(
  isPeaks: boolean,
  isExp: boolean
): { link1: string; link2: string } {
  if (isPeaks) {
    return {
      link1: "Ej: Track de la Ruta",
      link2: "Ej: Equipamiento utilizado",
    };
  }
  if (isExp) {
    return {
      link1: "Ej: Vídeo de la experiencia",
      link2: "Ej: Guía para la experiencia",
    };
  }
  return {
    link1: "Ej: Restaurante favorito",
    link2: "Ej: Alojamiento recomendado",
  };
}

/**
 * Validates and normalizes a user-supplied external link to http(s)://,
 * rejecting dangerous protocols such as javascript:, data:, or vbscript:.
 */
export function normalizeSafeExternalUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return null;
  }

  const candidate =
    lower.startsWith("http://") || lower.startsWith("https://")
      ? trimmed
      : trimmed.startsWith("//")
        ? `https:${trimmed}`
        : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isVideoLink(link?: string | null, linkName?: string | null): boolean {
  if (!link) return false;
  const urlStr = link.toLowerCase();
  const nameStr = (linkName || "").toLowerCase();
  return (
    urlStr.includes("youtube.com") ||
    urlStr.includes("youtu.be") ||
    urlStr.includes("vimeo.com") ||
    urlStr.includes("tiktok.com") ||
    nameStr.includes("vídeo") ||
    nameStr.includes("video")
  );
}

export type RecordLinkIconKind =
  | "video"
  | "camera"
  | "briefcase"
  | "footprints"
  | "map-pin"
  | "link";

export function getRecordLinkPresentation(
  link?: string | null,
  linkName?: string | null
): { href: string; displayName: string; iconKind: RecordLinkIconKind } | null {
  const href = normalizeSafeExternalUrl(link);
  if (!href) return null;

  const urlStr = href.toLowerCase();
  let iconKind: RecordLinkIconKind = "link";
  if (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")) {
    iconKind = "video";
  } else if (urlStr.includes("instagram.com")) {
    iconKind = "camera";
  } else if (urlStr.includes("linkedin.com")) {
    iconKind = "briefcase";
  } else if (
    urlStr.includes("strava.com") ||
    urlStr.includes("strava.app.link") ||
    urlStr.includes("wikiloc.com") ||
    urlStr.includes("komoot.com") ||
    urlStr.includes("alltrails.com") ||
    urlStr.includes("garmin.com") ||
    urlStr.includes("outdooractive.com") ||
    urlStr.includes("relive.cc") ||
    urlStr.includes("fatmap.com") ||
    urlStr.includes("trailforks.com")
  ) {
    iconKind = "footprints";
  } else if (
    urlStr.includes("google.com/maps") ||
    urlStr.includes("maps.google.") ||
    urlStr.includes("maps.apple.com") ||
    urlStr.includes("openstreetmap.org")
  ) {
    iconKind = "map-pin";
  }

  const trimmedLabel = linkName?.trim();
  const displayName =
    trimmedLabel ||
    (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")
      ? "Vídeo en YouTube"
      : urlStr.includes("instagram.com")
        ? "Publicación en Instagram"
        : urlStr.includes("linkedin.com")
          ? "Publicación en LinkedIn"
          : urlStr.includes("google.com/maps") ||
              urlStr.includes("maps.google.") ||
              urlStr.includes("maps.apple.com") ||
              urlStr.includes("openstreetmap.org")
            ? "Ver en mapa"
            : urlStr.includes("wikiloc.com")
              ? "Ruta en Wikiloc"
              : urlStr.includes("strava.com") || urlStr.includes("strava.app.link")
                ? "Actividad en Strava"
                : urlStr.includes("komoot.com")
                  ? "Ruta en Komoot"
                  : urlStr.includes("alltrails.com")
                    ? "Ruta en AllTrails"
                    : urlStr.includes("garmin.com")
                      ? "Actividad en Garmin"
                      : "Enlace adjunto");

  return { href, displayName, iconKind };
}
