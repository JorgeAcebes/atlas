"use client";

import React from "react";
import type { Session } from "@supabase/supabase-js";
import { NotebookPen, Star } from "lucide-react";
import { getIconComponent } from "@/components/icons";
import { sortPhotosByTime } from "@/lib/image-utils";
import type { CompanionProfile } from "@/lib/companions";
import {
  CompletedRecordCard,
  SelectablePhotoGrid,
  SortOrderToggle,
} from "./experience-record-card";
import { renderWithClickableLinks } from "./text-utils";
import { IconCheck, IconClose } from "./tracker-icons";
import type { Ascent, ExperienceRecord, SelectedItem, SummitPhoto } from "./types";

interface TrackerInfoPanelProps {
  selected: SelectedItem;
  fromStats: boolean;
  isPeaks: boolean;
  isReadOnly: boolean;
  session: Session | null;
  targetId?: string;
  selectedAscents: Ascent[];
  selectedExperienceRecords: ExperienceRecord[];
  experienceRecords: ExperienceRecord[];
  selectedPhotos: SummitPhoto[];
  selectedPhotosForEdit: string[];
  ascentsSortOrder: "asc" | "desc";
  setAscentsSortOrder: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  tripCompanionsMap: Record<string, CompanionProfile[]>;
  userFollowingSet: Set<string>;
  hasWishlist: boolean;
  wishlistEntry: Ascent | null;
  showWishlistNoteEditor: boolean;
  setShowWishlistNoteEditor: React.Dispatch<React.SetStateAction<boolean>>;
  wishlistNoteText: string;
  setWishlistNoteText: (val: string) => void;
  onClose: () => void;
  onSelectLocationForExp: (subItemKey: string) => void;
  onShareRecord: (item: SelectedItem, ascent: any, photos: SummitPhoto[]) => void;
  onOpenRecord: (item: SelectedItem, ascent?: any) => void;
  onAddPhotosToDate: (e: React.ChangeEvent<HTMLInputElement>, ascent: any) => void;
  onMaxPhotosReached: () => void;
  onPhotoClick: (photo: SummitPhoto) => void;
  onTogglePhotoSelection: (photoId: string) => void;
  onSaveWishlist: () => void;
  onSaveWishlistNote: () => void;
}

export function TrackerInfoPanel({
  selected,
  fromStats,
  isPeaks,
  isReadOnly,
  session,
  targetId,
  selectedAscents,
  selectedExperienceRecords,
  experienceRecords,
  selectedPhotos,
  selectedPhotosForEdit,
  ascentsSortOrder,
  setAscentsSortOrder,
  tripCompanionsMap,
  userFollowingSet,
  hasWishlist,
  wishlistEntry,
  showWishlistNoteEditor,
  setShowWishlistNoteEditor,
  wishlistNoteText,
  setWishlistNoteText,
  onClose,
  onSelectLocationForExp,
  onShareRecord,
  onOpenRecord,
  onAddPhotosToDate,
  onMaxPhotosReached,
  onPhotoClick,
  onTogglePhotoSelection,
  onSaveWishlist,
  onSaveWishlistNote,
}: TrackerInfoPanelProps) {
  const isExperience = selected.itemType === "experience";
  const toggleSortOrder = () =>
    setAscentsSortOrder((o) => (o === "asc" ? "desc" : "asc"));

  const renderExperienceRecord = (record: ExperienceRecord) => {
    const expectedSummitId = record.sub_item_id
      ? `${selected.id}::${record.sub_item_id}`
      : selected.id;
    const ascentPhotos = sortPhotosByTime(
      selectedPhotos.filter(
        (p) =>
          p.taken_on === record.achieved_on &&
          (p.summit_id === expectedSummitId || p.summit_id === selected.id)
      )
    );
    return (
      <CompletedRecordCard
        key={record.id}
        record={record}
        recordPhotos={ascentPhotos}
        selected={selected}
        isPeaks={false}
        isExp={true}
        isReadOnly={isReadOnly}
        session={session}
        targetId={targetId}
        tripCompanionsMap={tripCompanionsMap}
        userFollowingSet={userFollowingSet}
        selectedPhotosForEdit={selectedPhotosForEdit}
        allowPhotoSelection={false}
        onShareRecord={onShareRecord}
        onEditRecord={onOpenRecord}
        onAddPhotosToDate={onAddPhotosToDate}
        onMaxPhotosReached={onMaxPhotosReached}
        onPhotoClick={onPhotoClick}
        onTogglePhotoSelection={onTogglePhotoSelection}
      />
    );
  };

  return (
    <>
      {fromStats && (
        <div
          className="info-panel-backdrop--from-stats"
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10090,
            background: "rgba(0, 0, 0, 0.4)",
          }}
        />
      )}

      <aside
        className="info-panel"
        style={fromStats ? { zIndex: 10100 } : undefined}
        aria-label={`Información sobre ${selected.title}`}
      >
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
          <IconClose />
        </button>

        {isExperience ? (
          <>
            <span className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {selected.label && getIconComponent(selected.label) && (
                <span
                  style={{ display: "flex", width: 14, height: 14, alignItems: "center" }}
                >
                  {getIconComponent(selected.label)}
                </span>
              )}
              {selected.detail ? selected.detail.toUpperCase() : "EXPERIENCIA"}
            </span>
            <h2>{selected.title}</h2>

            <div style={{ marginTop: "16px" }}>
              {selected.subItems && selected.subItems.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ marginBottom: 8, fontSize: "0.9rem", color: "var(--foreground)" }}>
                    Desglose:
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selected.subItems.map((item: any) => {
                      const subItemKey = `${selected.id}::${item.id}`;
                      const records = experienceRecords.filter(
                        (r) => r.experience_id === selected.id && r.sub_item_id === item.id
                      );
                      const hasRecords = records.length > 0;
                      const subItemRegisteredDates = new Set(records.map((a) => a.achieved_on));
                      const subItemOtherPhotos = sortPhotosByTime(
                        selectedPhotos.filter(
                          (p) =>
                            p.summit_id === subItemKey && !subItemRegisteredDates.has(p.taken_on)
                        )
                      );

                      const isOpenable = hasRecords || subItemOtherPhotos.length > 0;
                      if (!isOpenable) {
                        return (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "12px 12px",
                              background: "var(--surface)",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                fontWeight: 500,
                                fontSize: "14px",
                              }}
                            >
                              {item.name}
                            </span>
                            {!isReadOnly && (
                              <button
                                type="button"
                                className="button button--purple button--small"
                                style={{
                                  margin: "-6px 0",
                                  padding: "4px 12px",
                                  minHeight: "28px",
                                  height: "auto",
                                  lineHeight: "1.2",
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  onSelectLocationForExp(subItemKey);
                                }}
                              >
                                Registrar
                              </button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <details
                          key={item.id}
                          className="subitem-details"
                          open={item.id === selected.sub_item_id || undefined}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            padding: "12px 12px",
                            background: "var(--surface)",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <summary
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                              outline: "none",
                              fontWeight: 500,
                              fontSize: "14px",
                              listStyle: "none",
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <svg
                                className="details-chevron"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ transition: "transform 0.2s", flexShrink: 0 }}
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              {item.name}
                            </span>

                            {!hasRecords ? (
                              !isReadOnly ? (
                                <button
                                  type="button"
                                  className="button button--purple button--small"
                                  style={{
                                    margin: "-6px 0",
                                    padding: "4px 12px",
                                    minHeight: "28px",
                                    height: "auto",
                                    lineHeight: "1.2",
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    onSelectLocationForExp(subItemKey);
                                  }}
                                >
                                  Registrar
                                </button>
                              ) : null
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <IconCheck style={{ color: "var(--pine)", width: 16, height: 16 }} />
                              </div>
                            )}
                          </summary>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "16px",
                              marginTop: 16,
                            }}
                          >
                            {records.length > 1 && (
                              <SortOrderToggle
                                sortOrder={ascentsSortOrder}
                                onToggle={toggleSortOrder}
                              />
                            )}
                            {hasRecords && (
                              <>
                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                  {records.map(renderExperienceRecord)}
                                </div>
                                {!isReadOnly && (
                                  <button
                                    type="button"
                                    className="button button--purple button--small"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      onSelectLocationForExp(subItemKey);
                                    }}
                                    style={{
                                      alignSelf: "flex-start",
                                      padding: "4px 12px",
                                      minHeight: "28px",
                                      height: "auto",
                                      lineHeight: "1.2",
                                      marginTop: "-8px",
                                    }}
                                  >
                                    Registrar otra vez
                                  </button>
                                )}
                              </>
                            )}

                            {subItemOtherPhotos.length > 0 && (
                              <div className="photo-section" style={{ marginTop: 8 }}>
                                <h5
                                  style={{
                                    margin: "0 0 12px 0",
                                    fontSize: "0.85rem",
                                    color: "var(--muted)",
                                  }}
                                >
                                  Otras fotos <small>{subItemOtherPhotos.length}</small>
                                </h5>
                                <SelectablePhotoGrid
                                  photos={subItemOtherPhotos}
                                  selectedPhotoIds={selectedPhotosForEdit}
                                  isReadOnly={isReadOnly}
                                  altText="Foto de la experiencia"
                                  onPhotoClick={onPhotoClick}
                                  onTogglePhotoSelection={onTogglePhotoSelection}
                                />
                              </div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  {!selected.subItems.every((item: any) =>
                    experienceRecords.some(
                      (r) => r.experience_id === selected.id && r.sub_item_id === item.id
                    )
                  ) && (
                    <div className="pending-card" style={{ marginTop: 16 }}>
                      {isReadOnly
                        ? "Aún no ha completado esta experiencia."
                        : "Aún no has completado esta experiencia."}
                    </div>
                  )}
                </div>
              ) : !isReadOnly ? (
                <div className="button-group">
                  <button
                    type="button"
                    className="button button--purple"
                    onClick={() => onSelectLocationForExp(`${selected.id}::`)}
                    style={{ width: "100%", marginBottom: 8 }}
                  >
                    Registrar experiencia
                  </button>
                </div>
              ) : null}
            </div>

            {(!selected.subItems || selected.subItems.length === 0) && (
              <>
                {selectedExperienceRecords.length === 0 ? (
                  <div className="pending-card">
                    {isReadOnly
                      ? "Aún no ha vivido esta experiencia."
                      : "Aún no has vivido esta experiencia."}
                  </div>
                ) : (
                  <>
                    {selectedExperienceRecords.length > 1 && (
                      <SortOrderToggle sortOrder={ascentsSortOrder} onToggle={toggleSortOrder} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {selectedExperienceRecords.map(renderExperienceRecord)}
                    </div>
                  </>
                )}
              </>
            )}

            {(() => {
              const registeredDates = new Set(
                selectedExperienceRecords.map((a) => a.achieved_on)
              );
              const otherPhotos = sortPhotosByTime(
                selectedPhotos.filter(
                  (p) => !registeredDates.has(p.taken_on) && p.summit_id === selected.id
                )
              );
              if (otherPhotos.length === 0) return null;
              return (
                <div className="photo-section" style={{ marginTop: 24 }}>
                  <h3>
                    Otras fotos <small>{otherPhotos.length}</small>
                  </h3>
                  <SelectablePhotoGrid
                    photos={otherPhotos}
                    selectedPhotoIds={selectedPhotosForEdit}
                    isReadOnly={isReadOnly}
                    altText={`Foto en ${selected.title}`}
                    onPhotoClick={onPhotoClick}
                    onTogglePhotoSelection={onTogglePhotoSelection}
                  />
                </div>
              );
            })()}
          </>
        ) : (
          <>
            <span className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {selected.label ? selected.label.toUpperCase() : ""}
            </span>
            <h2>{selected.title}</h2>
            {isPeaks ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 19,
                  }}
                >
                  <div className="altitude" style={{ marginTop: 0 }}>
                    {selected.subtitle.replace(" m", "")} <span>m</span>
                  </div>
                </div>
                <p className="range">{selected.detail}</p>
              </>
            ) : (
              <>
                {selected.subtitle && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 19,
                    }}
                  >
                    <div className="country-capital" style={{ marginTop: 0 }}>
                      {selected.subtitle}
                    </div>
                  </div>
                )}
                {selected.detail && <p className="range">{selected.detail}</p>}
              </>
            )}
            {selected.note && <p>{selected.note}</p>}

            {selectedAscents.length > 1 && (
              <SortOrderToggle sortOrder={ascentsSortOrder} onToggle={toggleSortOrder} />
            )}

            {selectedAscents.length > 0 ? (
              selectedAscents.map((ascent) => {
                const ascentPhotos = sortPhotosByTime(
                  selectedPhotos.filter((p) => p.taken_on === ascent.achieved_on)
                );
                return (
                  <CompletedRecordCard
                    key={ascent.id || ascent.achieved_on}
                    record={ascent}
                    recordPhotos={ascentPhotos}
                    selected={selected}
                    isPeaks={isPeaks}
                    isExp={false}
                    isReadOnly={isReadOnly}
                    session={session}
                    targetId={targetId}
                    tripCompanionsMap={tripCompanionsMap}
                    userFollowingSet={userFollowingSet}
                    selectedPhotosForEdit={selectedPhotosForEdit}
                    onShareRecord={onShareRecord}
                    onEditRecord={onOpenRecord}
                    onAddPhotosToDate={onAddPhotosToDate}
                    onMaxPhotosReached={onMaxPhotosReached}
                    onPhotoClick={onPhotoClick}
                    onTogglePhotoSelection={onTogglePhotoSelection}
                  />
                );
              })
            ) : hasWishlist ? (
              <div className="wishlist-card-wrap">
                <div
                  className="pending-card wishlist-pending-card"
                  style={{
                    background: "var(--amber-bg)",
                    color: "#a67c29",
                    borderColor: "#ecd9a5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Star size={14} fill="currentColor" strokeWidth={1} />
                    <span>{isReadOnly ? "En su lista de deseos" : "En tu lista de deseos"}</span>
                  </span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="wishlist-note-btn"
                      title={wishlistEntry?.notes ? "Editar nota" : "Añadir nota"}
                      onClick={() => {
                        setWishlistNoteText(wishlistEntry?.notes ?? "");
                        setShowWishlistNoteEditor((v) => !v);
                      }}
                      aria-label="Añadir o editar nota de lista de deseos"
                    >
                      <NotebookPen size={14} />
                    </button>
                  )}
                </div>
                {wishlistEntry?.notes && !showWishlistNoteEditor && (
                  <div className="wishlist-note-display user-written-text">
                    {renderWithClickableLinks(wishlistEntry.notes)}
                  </div>
                )}
                {!isReadOnly && showWishlistNoteEditor && (
                  <div className="wishlist-note-editor">
                    <textarea
                      className="wishlist-note-textarea"
                      value={wishlistNoteText}
                      onChange={(e) => setWishlistNoteText(e.target.value)}
                      placeholder="Escribe tu nota…"
                      rows={3}
                      autoFocus
                    />
                    <div className="wishlist-note-actions">
                      <button
                        type="button"
                        className="button button--quiet"
                        onClick={() => setShowWishlistNoteEditor(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className={`button ${isPeaks ? "button--green" : "button--purple"}`}
                        onClick={onSaveWishlistNote}
                      >
                        Guardar nota
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="pending-card">
                {isPeaks
                  ? isReadOnly
                    ? "Aún no ha registrado esta cima."
                    : "Aún no has registrado esta cima."
                  : isReadOnly
                    ? "Aún no ha registrado este país."
                    : "Aún no has registrado este país."}
              </div>
            )}

            {(() => {
              const registeredDates = new Set(selectedAscents.map((a) => a.achieved_on));
              const otherPhotos = sortPhotosByTime(
                selectedPhotos.filter((p) => !registeredDates.has(p.taken_on))
              );
              if (otherPhotos.length === 0) return null;
              return (
                <div className="photo-section" style={{ marginTop: 24 }}>
                  <h3>
                    Otras fotos <small>{otherPhotos.length}</small>
                  </h3>
                  <SelectablePhotoGrid
                    photos={otherPhotos}
                    selectedPhotoIds={selectedPhotosForEdit}
                    isReadOnly={isReadOnly}
                    altText={`Foto en ${selected.title}`}
                    onPhotoClick={onPhotoClick}
                    onTogglePhotoSelection={onTogglePhotoSelection}
                  />
                </div>
              );
            })()}

            <div className="panel-actions">
              {!isReadOnly && (
                <button
                  type="button"
                  className={`button ${isPeaks ? "button--green" : "button--purple"} button--wide`}
                  onClick={() => onOpenRecord(selected)}
                >
                  {selectedAscents.length > 0
                    ? "Registrar otra fecha"
                    : isPeaks
                      ? "Marcar como completado"
                      : "Marcar como visitado"}
                </button>
              )}
              {(!selectedAscents.length || hasWishlist) && !isReadOnly && (
                <button
                  type="button"
                  className="button button--quiet button--wide"
                  style={{ marginTop: 8 }}
                  onClick={onSaveWishlist}
                >
                  {hasWishlist ? "Quitar de mi lista de deseos" : "Añadir a mi lista de deseos"}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
