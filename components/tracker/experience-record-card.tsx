"use client";

import React from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDate } from "@/lib/date-utils";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import type { CompanionProfile } from "@/lib/companions";
import { RecordLinkBadge } from "@/components/shared/record-link-badge";
import { IconCamera, IconCheck, IconEdit, IconShare } from "./tracker-icons";
import type { SelectedItem, SummitPhoto } from "./types";

interface PhotoGridProps {
  photos: SummitPhoto[];
  selectedPhotoIds: string[];
  isReadOnly: boolean;
  altText: string;
  onPhotoClick: (photo: SummitPhoto) => void;
  onTogglePhotoSelection: (photoId: string) => void;
}

export function SelectablePhotoGrid({
  photos,
  selectedPhotoIds,
  isReadOnly,
  altText,
  onPhotoClick,
  onTogglePhotoSelection,
}: PhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <div className="photo-grid">
      {photos.map((photo) => {
        const publicUrl = getPhotoDisplayUrl(photo.public_url, photo.storage_path);
        if (!publicUrl) return null;
        const isUploading = Boolean(photo.id && photo.id.startsWith("uploading-"));
        const isSelected = !isUploading && selectedPhotoIds.includes(photo.id);
        return (
          <figure
            key={photo.id}
            className={isSelected ? "selected" : ""}
            onClick={() => onPhotoClick(photo)}
          >
            {!isReadOnly && !isUploading && (
              <button
                type="button"
                className={`photo-select-circle ${isSelected ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePhotoSelection(photo.id);
                }}
                aria-label="Seleccionar foto"
              >
                {isSelected && <IconCheck />}
              </button>
            )}
            <img src={publicUrl} alt={altText} loading="lazy" decoding="async" />
            {isUploading && <span className="photo-uploading-badge">Subiendo...</span>}
            {photo.caption && <figcaption>{photo.caption}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

export function SortOrderToggle({
  sortOrder,
  onToggle,
}: {
  sortOrder: "asc" | "desc";
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(92, 155, 125, 0.1)",
        borderRadius: "20px",
        padding: "3px",
        position: "relative",
        marginBottom: "16px",
        cursor: "pointer",
        userSelect: "none",
        width: "fit-content",
      }}
      onClick={onToggle}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          bottom: 3,
          left: sortOrder === "asc" ? 3 : "50%",
          right: sortOrder === "asc" ? "50%" : 3,
          background: "var(--pine)",
          borderRadius: "18px",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 600,
          color: sortOrder === "asc" ? "white" : "var(--pine)",
          transition: "color 0.2s ease",
          flex: 1,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Más antiguo
      </span>
      <span
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 600,
          color: sortOrder === "desc" ? "white" : "var(--pine)",
          transition: "color 0.2s ease",
          flex: 1,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Más reciente
      </span>
    </div>
  );
}

interface CompletedRecordCardProps {
  record: any;
  recordPhotos: SummitPhoto[];
  selected: SelectedItem;
  isPeaks: boolean;
  isExp: boolean;
  isReadOnly: boolean;
  session: Session | null;
  targetId?: string;
  tripCompanionsMap: Record<string, CompanionProfile[]>;
  userFollowingSet: Set<string>;
  selectedPhotosForEdit: string[];
  allowPhotoSelection?: boolean;
  onShareRecord: (item: SelectedItem, ascent: any, photos: SummitPhoto[]) => void;
  onEditRecord: (item: SelectedItem, ascent: any) => void;
  onAddPhotosToDate: (e: React.ChangeEvent<HTMLInputElement>, ascent: any) => void;
  onMaxPhotosReached: () => void;
  onPhotoClick: (photo: SummitPhoto) => void;
  onTogglePhotoSelection: (photoId: string) => void;
}

export function CompletedRecordCard({
  record,
  recordPhotos,
  selected,
  isPeaks,
  isExp,
  isReadOnly,
  session,
  targetId,
  tripCompanionsMap,
  userFollowingSet,
  selectedPhotosForEdit,
  allowPhotoSelection = true,
  onShareRecord,
  onEditRecord,
  onAddPhotosToDate,
  onMaxPhotosReached,
  onPhotoClick,
  onTogglePhotoSelection,
}: CompletedRecordCardProps) {
  const tripGrpId = record.trip_group_id;
  const tripComps = tripGrpId ? tripCompanionsMap[tripGrpId] : null;
  const filteredComps = tripComps
    ? tripComps.filter((c) => {
        if (c.id === targetId) return false;
        if (c.is_public !== false) return true;
        if (session?.user?.id === c.id) return true;
        if (userFollowingSet.has(c.id)) return true;
        return false;
      })
    : [];

  const companionLabel =
    filteredComps.length === 1
      ? isPeaks
        ? "Compañero de ruta:"
        : isExp
          ? "Compañero de experiencia:"
          : "Compañero de viaje:"
      : isPeaks
        ? "Compañeros de ruta:"
        : isExp
          ? "Compañeros de experiencia:"
          : "Compañeros de viaje:";

  return (
    <div className="completed-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <b style={{ marginTop: "6px" }}>
          {formatDate(record.achieved_on)}
          {record.end_date && ` - ${formatDate(record.end_date)}`}
        </b>

        {!isReadOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              type="button"
              title="Compartir registro"
              className="button button--quiet button--small"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                flexShrink: 0,
                padding: 0,
                margin: 0,
              }}
              onClick={() => onShareRecord(selected, record, recordPhotos)}
            >
              <IconShare style={{ width: 14, height: 14 }} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              title="Editar registro"
              className="button button--quiet button--small"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                flexShrink: 0,
                padding: 0,
                margin: 0,
              }}
              onClick={() =>
                onEditRecord(
                  isExp ? { ...selected, sub_item_id: record.sub_item_id } : selected,
                  record
                )
              }
            >
              <IconEdit style={{ width: 14, height: 14 }} strokeWidth={1.5} />
            </button>
            <label
              title="Añadir fotos a esta fecha"
              className="button button--quiet button--small"
              onClick={(e) => {
                if (recordPhotos.length >= 4) {
                  e.preventDefault();
                  onMaxPhotosReached();
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                flexShrink: 0,
                padding: 0,
                margin: 0,
                cursor: recordPhotos.length >= 4 ? "not-allowed" : "pointer",
                opacity: recordPhotos.length >= 4 ? 0.5 : 1,
              }}
            >
              <IconCamera style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onAddPhotosToDate(e, record)}
                style={{ display: "none" }}
                disabled={recordPhotos.length >= 4}
              />
            </label>
          </div>
        )}
      </div>

      {record.location_name && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "13px",
            fontWeight: 500,
            display: "flex",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }}
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {record.location_name}
        </div>
      )}

      {record.notes && (
        <p className="record-notes user-written-text" style={{ marginTop: "4px", marginBottom: 0 }}>
          &ldquo;{record.notes}&rdquo;
        </p>
      )}

      {(record.link || record.link_2) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: Boolean(record.notes) ? 4 : 8,
          }}
        >
          <RecordLinkBadge link={record.link} linkName={record.link_name} />
          <RecordLinkBadge link={record.link_2} linkName={record.link_name_2} />
        </div>
      )}

      {filteredComps.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
            {companionLabel}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {filteredComps.map((comp) => (
              <Link
                key={comp.id}
                href={`/perfil/${comp.username}`}
                title={`@${comp.username}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    backgroundColor: "var(--pine)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: "bold",
                    overflow: "hidden",
                    border: "1.5px solid var(--card-bg, #fff)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  }}
                >
                  {comp.avatar_url ? (
                    <img
                      src={getPhotoDisplayUrl(comp.avatar_url)}
                      alt={comp.username}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    comp.username.charAt(0).toUpperCase()
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recordPhotos.length > 0 && (
        <div className="photo-section" style={{ marginTop: 16 }}>
          <SelectablePhotoGrid
            photos={recordPhotos}
            selectedPhotoIds={allowPhotoSelection ? selectedPhotosForEdit : []}
            isReadOnly={isReadOnly || !allowPhotoSelection}
            altText={isExp ? "Foto de la experiencia" : `Foto en ${selected.title}`}
            onPhotoClick={onPhotoClick}
            onTogglePhotoSelection={onTogglePhotoSelection}
          />
        </div>
      )}
    </div>
  );
}
