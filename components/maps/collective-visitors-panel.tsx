"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPhotoDisplayUrl } from "@/lib/photo-client";

export interface SelectedCollectiveSummit {
  id: string;
  name: string;
  visitors: { id: string; username: string; avatar: string }[];
  isExperience?: boolean;
}

export function CollectiveVisitorsPanel({
  selectedSummit,
  isPeaks,
  scope,
  onClose,
}: {
  selectedSummit: SelectedCollectiveSummit;
  isPeaks: boolean;
  scope: "all" | "following";
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div className="collective-visitors-panel">
      <div className="collective-visitors-header">
        <h3>{selectedSummit.name}</h3>
        <button onClick={onClose} className="collective-visitors-close" aria-label="Cerrar panel">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {selectedSummit.visitors.length > 0 ? (
        <>
          <p className="collective-visitors-count">
            {selectedSummit.visitors.length}{" "}
            {selectedSummit.visitors.length === 1 ? "persona ha" : "personas han"}{" "}
            {selectedSummit.isExperience
              ? "vivido esta experiencia"
              : isPeaks
                ? "ascendido esta cumbre"
                : "visitado este lugar"}
          </p>
          <ul className="collective-visitors-list">
            {selectedSummit.visitors.map((v) => {
              const isExp = Boolean(selectedSummit.isExperience);
              const recordChallenge = isExp ? "experiences" : isPeaks ? "peaks" : "countries";
              const recordId = selectedSummit.id;
              const profileBaseUrl = v.username
                ? `/perfil/${v.username}?challenge=${recordChallenge}&from=ranking`
                : "";
              const recordUrlWithHash =
                v.username && recordId
                  ? `${profileBaseUrl}#panel=${encodeURIComponent(recordId)}`
                  : profileBaseUrl;

              const handleVisitorClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!v.username || !recordId) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
                  return;
                }
                e.preventDefault();
                try {
                  sessionStorage.setItem("auto_open_panel", recordId);
                } catch (err) {
                  console.warn("Could not set sessionStorage:", err);
                }
                router.push(profileBaseUrl);
              };

              return (
                <li key={v.id}>
                  <Link
                    href={recordUrlWithHash}
                    className="collective-visitor-link"
                    onClick={handleVisitorClick}
                    title={v.username ? `Ver registro de @${v.username}` : undefined}
                  >
                    <div className="collective-visitor-avatar">
                      {v.avatar ? (
                        <img src={getPhotoDisplayUrl(v.avatar)} alt={v.username} />
                      ) : (
                        v.username.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span>@{v.username}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="collective-visitors-empty">
          {scope === "following"
            ? isPeaks
              ? "Ninguna persona a la que sigues ha ascendido esta cumbre todavía."
              : "Ninguna persona a la que sigues ha visitado este lugar todavía."
            : isPeaks
              ? "Nadie ha ascendido esta cumbre todavía."
              : "Nadie ha visitado este lugar todavía."}
        </p>
      )}
    </div>
  );
}
