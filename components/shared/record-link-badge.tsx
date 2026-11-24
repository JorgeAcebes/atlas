"use client";

import {
  Briefcase,
  Camera,
  Footprints,
  Link as LinkIcon,
  MapPin,
  Video,
} from "lucide-react";
import { getRecordLinkPresentation } from "@/lib/link-utils";

export function RecordLinkBadge({
  link,
  linkName,
}: {
  link?: string | null;
  linkName?: string | null;
}) {
  const presentation = getRecordLinkPresentation(link, linkName);
  if (!presentation) return null;

  const { href, displayName, iconKind } = presentation;
  const Icon =
    iconKind === "video"
      ? Video
      : iconKind === "camera"
        ? Camera
        : iconKind === "briefcase"
          ? Briefcase
          : iconKind === "footprints"
            ? Footprints
            : iconKind === "map-pin"
              ? MapPin
              : LinkIcon;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "13px",
        color: "var(--pine)",
        textDecoration: "none",
        fontWeight: 500,
        padding: "4px 10px",
        backgroundColor: "rgba(35, 78, 82, 0.05)",
        borderRadius: 16,
        border: "1px solid rgba(35, 78, 82, 0.1)",
        width: "fit-content",
      }}
    >
      <Icon size={14} />
      <span style={{ textDecoration: "underline" }}>{displayName}</span>
    </a>
  );
}
