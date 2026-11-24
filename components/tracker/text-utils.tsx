import React from "react";
import { normalizeSafeExternalUrl } from "@/lib/link-utils";

export function renderWithClickableLinks(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    const safeUrl =
      part.startsWith("http://") || part.startsWith("https://")
        ? normalizeSafeExternalUrl(part)
        : null;
    if (safeUrl) {
      return (
        <a
          key={i}
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#a67c29", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
