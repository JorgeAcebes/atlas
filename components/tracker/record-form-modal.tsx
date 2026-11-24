"use client";

import React, { useEffect, useMemo, useState } from "react";
import { countries } from "@/data/countries";
import { getIconComponent } from "@/components/icons";
import { LocationSearch } from "@/components/location-search";
import { CompanionSelector } from "@/components/companion-selector";
import { getLinkPlaceholders } from "@/lib/link-utils";
import { precompressPhotoFile } from "@/lib/image-utils";
import type { CompanionProfile } from "@/lib/companions";
import { IconCamera, IconClose } from "./tracker-icons";
import type { SelectedItem, SummitPhoto } from "./types";

export interface RecordFormDraft {
  originalAchievedOn: string | null;
  editingExpRecordId: string | null;
  climbDate: string | null;
  climbEndDate: string | null;
  isDateUnknown: boolean;
  isEndDateEnabled: boolean;
  isDateModified: boolean;
  notes: string;
  link: string;
  linkName: string;
  link2: string;
  linkName2: string;
  showSecondLink: boolean;
  locationName: string;
  selectedLatLng: { lat: number; lng: number } | null;
  selectedCompanions: CompanionProfile[];
  companionStatuses: Record<string, "pending" | "accepted" | "rejected" | "separated">;
  currentTripGroupId: string | null;
  originalTripDates: { start: string; end?: string | null } | null;
  files: File[];
  deletedRecordPhotoIds: string[];
}

export interface RecordSavePayload {
  climbDate: string | null;
  climbEndDate: string | null;
  isDateUnknown: boolean;
  isEndDateEnabled: boolean;
  originalAchievedOn: string | null;
  editingExpRecordId: string | null;
  notes: string;
  link: string;
  linkName: string;
  link2: string;
  linkName2: string;
  locationName: string;
  selectedLatLng: { lat: number; lng: number } | null;
  selectedCompanions: CompanionProfile[];
  companionStatuses: Record<string, "pending" | "accepted" | "rejected" | "separated">;
  currentTripGroupId: string | null;
  originalTripDates: { start: string; end?: string | null } | null;
  files: File[];
  deletedRecordPhotoIds: string[];
}

interface RecordFormModalProps {
  selected: SelectedItem;
  isPeaks: boolean;
  isExp: boolean;
  fromStats: boolean;
  saving: boolean;
  initialDraft: RecordFormDraft;
  photos: SummitPhoto[];
  selectedPhotosForEdit: string[];
  onRemoveGalleryPhoto: (photoId: string) => void;
  onNotice: (msg: string) => void;
  onPickLocationOnMap: (draftSnapshot: RecordFormDraft) => void;
  onSave: (payload: RecordSavePayload) => void;
  onDelete: (editingExpRecordId: string | null, originalAchievedOn: string | null) => void;
  onClose: () => void;
}

const countriesIdSet = new Set(countries.map((c) => c.id));

function parseDateValue(dateStr: string | null): Date | null {
  if (!dateStr || dateStr === "1900-01-01") return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function RecordFormModal({
  selected,
  isPeaks,
  isExp,
  fromStats,
  saving,
  initialDraft,
  photos,
  selectedPhotosForEdit,
  onRemoveGalleryPhoto,
  onNotice,
  onPickLocationOnMap,
  onSave,
  onDelete,
  onClose,
}: RecordFormModalProps) {
  const [climbDate, setClimbDate] = useState<Date | null>(() => parseDateValue(initialDraft.climbDate));
  const [climbEndDate, setClimbEndDate] = useState<Date | null>(() =>
    parseDateValue(initialDraft.climbEndDate)
  );
  const [isDateUnknown, setIsDateUnknown] = useState(initialDraft.isDateUnknown);
  const [isEndDateEnabled, setIsEndDateEnabled] = useState(initialDraft.isEndDateEnabled);
  const [isDateModified, setIsDateModified] = useState(initialDraft.isDateModified);
  const [notes, setNotes] = useState(initialDraft.notes);
  const [link, setLink] = useState(initialDraft.link);
  const [linkName, setLinkName] = useState(initialDraft.linkName);
  const [link2, setLink2] = useState(initialDraft.link2);
  const [linkName2, setLinkName2] = useState(initialDraft.linkName2);
  const [showSecondLink, setShowSecondLink] = useState(initialDraft.showSecondLink);
  const [locationName, setLocationName] = useState(initialDraft.locationName);
  const [selectedLatLng, setSelectedLatLng] = useState(initialDraft.selectedLatLng);
  const [selectedCompanions, setSelectedCompanions] = useState<CompanionProfile[]>(
    initialDraft.selectedCompanions
  );
  const [files, setFiles] = useState<File[]>(initialDraft.files);
  const [deletedRecordPhotoIds, setDeletedRecordPhotoIds] = useState<string[]>(
    initialDraft.deletedRecordPhotoIds
  );

  // Synchronize async companion fetches or returning from map location picker cleanly
  useEffect(() => {
    setSelectedCompanions(initialDraft.selectedCompanions);
  }, [initialDraft.selectedCompanions]);

  useEffect(() => {
    if (initialDraft.selectedLatLng) setSelectedLatLng(initialDraft.selectedLatLng);
    if (initialDraft.locationName) setLocationName(initialDraft.locationName);
  }, [initialDraft.selectedLatLng, initialDraft.locationName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Revoke preview blob URLs properly to avoid memory leaks
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setFilePreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const isSelectedExperience = selected.itemType === "experience";
  const currentRecordSummitId = selected.sub_item_id
    ? `${selected.id}::${selected.sub_item_id}`
    : selected.id;
  const currentRecordDate = isDateUnknown
    ? "1900-01-01"
    : climbDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const existingRecordPhotos = useMemo(() => {
    return photos.filter((p) => {
      const matchesSummit =
        p.summit_id === currentRecordSummitId ||
        (!selected.sub_item_id && p.summit_id === selected.id) ||
        (isSelectedExperience &&
          selected.sub_item_id &&
          (p.summit_id === currentRecordSummitId || p.summit_id === selected.id));
      if (!matchesSummit) return false;
      if (deletedRecordPhotoIds.includes(p.id)) return false;

      if (initialDraft.originalAchievedOn) {
        if (p.taken_on === initialDraft.originalAchievedOn) return true;
        if (
          currentRecordDate &&
          currentRecordDate !== initialDraft.originalAchievedOn &&
          p.taken_on === currentRecordDate
        ) {
          return true;
        }
        return false;
      }
      return p.taken_on === currentRecordDate;
    });
  }, [
    photos,
    selected.id,
    selected.sub_item_id,
    isSelectedExperience,
    currentRecordSummitId,
    deletedRecordPhotoIds,
    initialDraft.originalAchievedOn,
    currentRecordDate,
  ]);

  const galleryPhotosToAdd = useMemo(() => {
    const photoMap = new Map(photos.map((p) => [p.id, p]));
    const existingSet = new Set(existingRecordPhotos.map((p) => p.id));
    return selectedPhotosForEdit
      .map((id) => photoMap.get(id))
      .filter((p): p is SummitPhoto => Boolean(p) && !existingSet.has(p!.id));
  }, [selectedPhotosForEdit, photos, existingRecordPhotos]);

  const totalModalPhotos =
    existingRecordPhotos.length + galleryPhotosToAdd.length + files.length;
  const isPhotoLimitReached = totalModalPhotos >= 4;

  const onFilesChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    const currentTotal =
      existingRecordPhotos.length + galleryPhotosToAdd.length + files.length;

    if (currentTotal + nextFiles.length > 4) {
      const remainingSlots = Math.max(0, 4 - currentTotal);
      onNotice(
        remainingSlots > 0
          ? `Máximo 4 fotos por registro. Solo puedes añadir ${remainingSlots} foto${remainingSlots !== 1 ? "s" : ""} más.`
          : "Máximo 4 fotos por registro. Ya has alcanzado el límite de 4 fotos."
      );
      event.target.value = "";
      return;
    }

    const remainingSlots = Math.max(0, 4 - currentTotal);
    const filesToAdd = nextFiles.slice(0, remainingSlots);
    filesToAdd.forEach((f) => {
      if (f.type.startsWith("image/")) {
        void precompressPhotoFile(f);
      }
    });
    setFiles((prev) => [...prev, ...filesToAdd]);
    if (!isDateUnknown && !isDateModified && filesToAdd[0]?.lastModified) {
      setClimbDate(new Date(filesToAdd[0].lastModified));
    }
  };

  const buildSnapshot = (): RecordFormDraft => ({
    ...initialDraft,
    climbDate: climbDate ? climbDate.toISOString().slice(0, 10) : null,
    climbEndDate: climbEndDate ? climbEndDate.toISOString().slice(0, 10) : null,
    isDateUnknown,
    isEndDateEnabled,
    isDateModified,
    notes,
    link,
    linkName,
    link2,
    linkName2,
    showSecondLink,
    locationName,
    selectedLatLng,
    selectedCompanions,
    files,
    deletedRecordPhotoIds,
  });

  const handleSubmit = () => {
    onSave({
      climbDate: climbDate ? climbDate.toISOString().slice(0, 10) : null,
      climbEndDate: climbEndDate ? climbEndDate.toISOString().slice(0, 10) : null,
      isDateUnknown,
      isEndDateEnabled,
      originalAchievedOn: initialDraft.originalAchievedOn,
      editingExpRecordId: initialDraft.editingExpRecordId,
      notes,
      link,
      linkName,
      link2,
      linkName2,
      locationName,
      selectedLatLng,
      selectedCompanions,
      companionStatuses: initialDraft.companionStatuses,
      currentTripGroupId: initialDraft.currentTripGroupId,
      originalTripDates: initialDraft.originalTripDates,
      files,
      deletedRecordPhotoIds,
    });
  };

  const isRecordExp = Boolean(isExp || isSelectedExperience);
  const linkPlaceholders = getLinkPlaceholders(isPeaks, isRecordExp);
  const maxDateIso = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="modal-backdrop"
      style={fromStats ? { zIndex: 10200 } : undefined}
      onWheel={(e) => e.stopPropagation()}
    >
      <section
        className="record-dialog"
        role="dialog"
        aria-modal="true"
        style={{ overscrollBehavior: "contain" }}
      >
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
          <IconClose />
        </button>
        <span className="eyebrow">
          {isPeaks
            ? "REGISTRAR ASCENSIÓN"
            : isSelectedExperience
              ? "REGISTRAR EXPERIENCIA"
              : "REGISTRAR VISITA"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          {isSelectedExperience && selected.iconName && (
            <span style={{ color: "var(--foreground)" }}>
              {getIconComponent(selected.iconName, 26)}
            </span>
          )}
          <h2 style={{ margin: 0, fontSize: "1.35rem", lineHeight: "1.2" }}>{selected.title}</h2>
        </div>

        {isSelectedExperience ? (
          selected.subtitle ? <p>{selected.subtitle}</p> : null
        ) : countriesIdSet.has(selected.id) ? null : (
          <p>{selected.subtitle ? `${selected.label} · ${selected.subtitle}` : selected.label}</p>
        )}

        {isSelectedExperience && (
          <div style={{ marginBottom: 16, zIndex: 50 }}>
            <div style={{ marginBottom: 8 }}>
              <label className="field-label" style={{ display: "block", marginBottom: 4 }}>
                Ubicación
              </label>
              <LocationSearch
                value={locationName}
                onChange={setLocationName}
                onSelect={(lat, lng, name) => {
                  setSelectedLatLng({ lat, lng });
                  setLocationName(name);
                }}
                placeholder="Buscar país, región, ciudad..."
                className="notes-input"
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => onPickLocationOnMap(buildSnapshot())}
                style={{ color: "var(--pine)", padding: "4px 8px" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 14, height: 14, marginRight: 6 }}
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Modificar ubicación
              </button>
            </div>
          </div>
        )}

        <div className="field-label" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span>
              {isPeaks
                ? "Fecha de la ascensión"
                : isExp
                  ? "Fecha de la experiencia"
                  : "Fecha de la visita"}
            </span>
            {!isDateUnknown && !isEndDateEnabled && (
              <button
                type="button"
                className="diff-toggle"
                style={{ fontSize: "0.85em", padding: "4px 8px", height: "auto" }}
                onClick={() => {
                  setIsEndDateEnabled(true);
                  if (!climbEndDate && climbDate) {
                    setClimbEndDate(new Date(climbDate));
                    setIsDateModified(true);
                  }
                }}
              >
                <svg
                  className="diff-toggle-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 14, height: 14 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Fecha finalización
              </button>
            )}
          </div>

          {isDateUnknown ? (
            <button
              type="button"
              className="button button--outline button--wide"
              onClick={() => {
                setIsDateUnknown(false);
                setClimbDate(new Date());
                setIsDateModified(true);
              }}
            >
              Establecer fecha
            </button>
          ) : isEndDateEnabled ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", marginTop: 4 }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
                <label style={{ fontSize: "0.8em", color: "var(--muted)" }}>Comienzo</label>
                <input
                  type="date"
                  value={climbDate ? climbDate.toISOString().slice(0, 10) : ""}
                  onChange={(e) => {
                    setClimbDate(e.target.value ? new Date(e.target.value) : new Date());
                    setIsDateModified(true);
                  }}
                  max={maxDateIso}
                  style={{ padding: "0 12px", margin: 0, height: "35px", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <label style={{ fontSize: "0.8em", color: "var(--muted)" }}>Fin</label>
                  <button
                    type="button"
                    className="button button--quiet"
                    style={{ padding: 0, height: 16, minWidth: "auto", border: "none" }}
                    onClick={() => {
                      setIsEndDateEnabled(false);
                      setClimbEndDate(null);
                    }}
                    title="Quitar fecha finalización"
                  >
                    <IconClose style={{ width: 12, height: 12 }} />
                  </button>
                </div>
                <input
                  type="date"
                  value={climbEndDate ? climbEndDate.toISOString().slice(0, 10) : ""}
                  onChange={(e) => {
                    setClimbEndDate(e.target.value ? new Date(e.target.value) : new Date());
                    setIsDateModified(true);
                  }}
                  min={climbDate ? climbDate.toISOString().slice(0, 10) : ""}
                  max={maxDateIso}
                  style={{ padding: "0 12px", margin: 0, height: "35px", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: "0.8em", visibility: "hidden" }}>X</label>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setIsDateUnknown(true);
                    setClimbDate(null);
                    setClimbEndDate(null);
                    setIsEndDateEnabled(false);
                    setIsDateModified(true);
                  }}
                  title="Quitar fechas"
                  style={{
                    padding: 0,
                    minWidth: "auto",
                    width: "35px",
                    height: "35px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: 0,
                  }}
                >
                  <IconClose style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: 4 }}>
              <input
                type="date"
                value={climbDate ? climbDate.toISOString().slice(0, 10) : ""}
                onChange={(e) => {
                  setClimbDate(e.target.value ? new Date(e.target.value) : new Date());
                  setIsDateModified(true);
                }}
                max={maxDateIso}
                style={{
                  flex: 1,
                  padding: "0 12px",
                  margin: 0,
                  height: "35px",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                className="button button--quiet"
                onClick={() => {
                  setIsDateUnknown(true);
                  setClimbDate(null);
                  setIsDateModified(true);
                }}
                title="Quitar fecha"
                style={{
                  padding: 0,
                  minWidth: "auto",
                  width: "35px",
                  height: "35px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: 0,
                }}
              >
                <IconClose style={{ width: 16, height: 16 }} />
              </button>
            </div>
          )}
        </div>

        <div className="field-label" style={{ marginBottom: 13 }}>
          <span>Añadir fotos</span>
          <label
            className={`file-dropzone ${isPhotoLimitReached ? "file-dropzone--disabled" : ""}`}
            style={
              isPhotoLimitReached
                ? {
                    opacity: 0.45,
                    cursor: "not-allowed",
                    borderColor: "var(--muted)",
                    background: "rgba(0, 0, 0, 0.04)",
                  }
                : undefined
            }
            title={
              isPhotoLimitReached
                ? "Máximo 4 fotos por registro. Ya has alcanzado el límite."
                : undefined
            }
            onClick={(e) => {
              if (isPhotoLimitReached) e.preventDefault();
            }}
            onDragOver={(e) => {
              if (isPhotoLimitReached) e.preventDefault();
            }}
            onDrop={(e) => {
              if (isPhotoLimitReached) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <IconCamera />
            <span className="file-dropzone-text">
              <span className="hide-on-mobile">
                {isPhotoLimitReached
                  ? "Límite alcanzado (máx. 4 fotos)"
                  : "Sube o arrastra tus fotos aquí"}
              </span>
              <span className="show-on-mobile">
                {isPhotoLimitReached ? "Máx. 4 fotos alcanzado" : "Sube tus fotos aquí"}
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onFilesChanged}
              disabled={isPhotoLimitReached}
            />
          </label>
        </div>

        {(existingRecordPhotos.length > 0 || files.length > 0 || galleryPhotosToAdd.length > 0) && (
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "8px",
            }}
          >
            {existingRecordPhotos.map((photo) => (
              <div key={`existing-${photo.id}`} style={{ position: "relative", display: "inline-block" }}>
                <img
                  src={photo.public_url}
                  alt="preview guardada"
                  style={{
                    width: "48px",
                    height: "48px",
                    objectFit: "cover",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setDeletedRecordPhotoIds((prev) => [...prev, photo.id])}
                  title="Quitar foto del registro"
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#e74c3c",
                    color: "white",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    zIndex: 10,
                  }}
                >
                  <IconClose style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ))}

            {files.map((_, i) => (
              <div key={`local-${i}`} style={{ position: "relative", display: "inline-block" }}>
                {filePreviews[i] && (
                  <img
                    src={filePreviews[i]}
                    alt="preview local"
                    style={{
                      width: "48px",
                      height: "48px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  title="Quitar imagen"
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#e74c3c",
                    color: "white",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    zIndex: 10,
                  }}
                >
                  <IconClose style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ))}

            {galleryPhotosToAdd.map((p) => (
              <div key={`gallery-${p.id}`} style={{ position: "relative", display: "inline-block" }}>
                <img
                  src={p.public_url}
                  alt="preview galeria"
                  style={{
                    width: "48px",
                    height: "48px",
                    objectFit: "cover",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => onRemoveGalleryPhoto(p.id)}
                  title="Quitar imagen"
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#e74c3c",
                    color: "white",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    zIndex: 10,
                  }}
                >
                  <IconClose style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {totalModalPhotos > 0 && (
          <p
            className="file-count"
            style={{
              marginTop: "4px",
              color: isPhotoLimitReached ? "var(--muted)" : "var(--sage)",
              fontSize: "12px",
            }}
          >
            {totalModalPhotos} / 4 fotos en este registro
            {files.length > 0 || galleryPhotosToAdd.length > 0
              ? ` (${files.length + galleryPhotosToAdd.length} nueva${
                  files.length + galleryPhotosToAdd.length !== 1 ? "s" : ""
                } por guardar)`
              : ""}
            .
          </p>
        )}

        <CompanionSelector
          mode={isPeaks ? "peaks" : isExp ? "experience" : "countries"}
          selectedCompanions={selectedCompanions}
          onChange={setSelectedCompanions}
          existingStatuses={initialDraft.companionStatuses}
        />

        <label className="field-label" style={{ marginBottom: 12 }}>
          Notas
          <textarea
            placeholder={
              isExp
                ? "Acompañantes, sensaciones ..."
                : "Ciudades visitadas, experiencias, lo que quieras recordar..."
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom:
              Boolean(linkName.trim()) && !showSecondLink && !link2 && !linkName2 ? 8 : 16,
          }}
        >
          <label className="field-label">
            Enlace
            <input
              type="url"
              placeholder="https://..."
              value={link}
              onChange={(e) => {
                const v = e.target.value;
                setLink(v);
                if (!v) {
                  setLinkName("");
                  setLink2("");
                  setLinkName2("");
                  setShowSecondLink(false);
                }
              }}
            />
          </label>
          <label className="field-label" style={{ opacity: !link ? 0.5 : 1 }}>
            Texto del enlace
            <input
              type="text"
              placeholder={linkPlaceholders.link1}
              value={linkName}
              onChange={(e) => {
                const v = e.target.value;
                setLinkName(v);
                if (!v && !link2 && !linkName2) setShowSecondLink(false);
              }}
              disabled={!link}
              title={!link ? "Añade un enlace primero" : ""}
            />
          </label>
        </div>

        {Boolean(linkName.trim()) && !showSecondLink && !link2 && !linkName2 && (
          <div style={{ marginTop: -4, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setShowSecondLink(true)}
              style={{
                background: "none",
                border: "none",
                padding: "2px 0",
                fontSize: "13px",
                color: "var(--pine, #234e52)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 500,
                opacity: 0.85,
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 600 }}>+</span>
              <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
                Añadir un segundo enlace
              </span>
            </button>
          </div>
        )}

        {(showSecondLink || Boolean(link2 || linkName2)) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: 16,
            }}
          >
            <label className="field-label">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Segundo enlace</span>
                <button
                  type="button"
                  onClick={() => {
                    setLink2("");
                    setLinkName2("");
                    setShowSecondLink(false);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: "11px",
                    color: "var(--danger, #a34f3d)",
                    cursor: "pointer",
                    fontWeight: 400,
                  }}
                  title="Quitar segundo enlace"
                >
                  Quitar
                </button>
              </div>
              <input
                type="url"
                placeholder="https://..."
                value={link2}
                onChange={(e) => {
                  const v = e.target.value;
                  setLink2(v);
                  if (!v) setLinkName2("");
                }}
              />
            </label>
            <label className="field-label" style={{ opacity: !link2 ? 0.5 : 1 }}>
              Texto del segundo enlace
              <input
                type="text"
                placeholder={linkPlaceholders.link2}
                value={linkName2}
                onChange={(e) => setLinkName2(e.target.value)}
                disabled={!link2}
                title={!link2 ? "Añade un enlace primero" : ""}
              />
            </label>
          </div>
        )}

        <button
          type="button"
          className={`button ${isPeaks ? "button--green" : "button--purple"} button--wide`}
          disabled={saving}
          onClick={handleSubmit}
        >
          {saving ? "Guardando…" : "Guardar en mi mapa"}
        </button>

        {initialDraft.originalAchievedOn && (
          <button
            type="button"
            className="button button--quiet button--wide"
            style={{ marginTop: 8, color: "var(--danger, #a34f3d)" }}
            disabled={saving}
            onClick={() =>
              onDelete(initialDraft.editingExpRecordId, initialDraft.originalAchievedOn)
            }
          >
            Eliminar registro
          </button>
        )}
      </section>
    </div>
  );
}
