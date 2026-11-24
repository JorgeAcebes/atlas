"use client";

import React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { IconClose, IconFolderMove, IconTrash } from "./tracker-icons";
import type { Ascent, SelectedItem, SummitPhoto } from "./types";

const PhotoLightbox = dynamic(
  () => import("@/components/photo-lightbox").then((m) => m.PhotoLightbox),
  { ssr: false }
);
const PhotoEditor = dynamic(
  () => import("@/components/photo-editor"),
  { ssr: false }
);

interface PhotoModalsProps {
  lightboxPhoto: SummitPhoto | null;
  currentPhotoGroup: SummitPhoto[];
  lightboxIndex: number;
  activeSelected: SelectedItem | null;
  isReadOnly: boolean;
  saving: boolean;
  lightboxCaptionModalOpen: boolean;
  setLightboxCaptionModalOpen: (open: boolean) => void;
  lightboxNewCaption: string;
  setLightboxNewCaption: (val: string) => void;
  selectedPhotosForEdit: string[];
  setSelectedPhotosForEdit: React.Dispatch<React.SetStateAction<string[]>>;
  assignToRecordModalOpen: boolean;
  setAssignToRecordModalOpen: (open: boolean) => void;
  selectedAscents: Ascent[];
  editorPhoto: SummitPhoto | null;
  onIndexChange: (photo: SummitPhoto) => void;
  onOpenEditor: (photo: SummitPhoto) => void;
  onOpenCaptionModal: (photo: SummitPhoto) => void;
  onSaveCaption: () => void;
  onDeletePhoto: (photo: SummitPhoto) => void;
  onOpenAssignModal: () => void;
  onAssignPhotosToRecord: (targetDate: string) => void;
  onOpenNewRecordFromAssign: () => void;
  onBatchDeletePhotos: () => void;
  onSaveEditedPhoto: (blob: Blob) => void;
}

export function PhotoModals({
  lightboxPhoto,
  currentPhotoGroup,
  lightboxIndex,
  activeSelected,
  isReadOnly,
  saving,
  lightboxCaptionModalOpen,
  setLightboxCaptionModalOpen,
  lightboxNewCaption,
  setLightboxNewCaption,
  selectedPhotosForEdit,
  setSelectedPhotosForEdit,
  assignToRecordModalOpen,
  setAssignToRecordModalOpen,
  selectedAscents,
  editorPhoto,
  onIndexChange,
  onOpenEditor,
  onOpenCaptionModal,
  onSaveCaption,
  onDeletePhoto,
  onOpenAssignModal,
  onAssignPhotosToRecord,
  onOpenNewRecordFromAssign,
  onBatchDeletePhotos,
  onSaveEditedPhoto,
}: PhotoModalsProps) {
  return (
    <>
      {lightboxPhoto && (
        <>
          <PhotoLightbox
            photos={currentPhotoGroup}
            currentIndex={lightboxIndex !== -1 ? lightboxIndex : 0}
            onIndexChange={(idx) => {
              if (currentPhotoGroup[idx]) onIndexChange(currentPhotoGroup[idx]);
            }}
            onClose={() => window.history.back()}
            title={activeSelected?.title || ""}
            canEdit={!isReadOnly}
            onEditPhoto={(photo) => {
              onOpenEditor(photo as any);
              window.history.pushState(null, "", "#editor");
            }}
            onEditCaption={(photo) => onOpenCaptionModal(photo as any)}
            onDeletePhoto={(photo) => onDeletePhoto(photo as any)}
          />

          {lightboxCaptionModalOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                className="modal-backdrop"
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 100050,
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px",
                }}
                onClick={() => setLightboxCaptionModalOpen(false)}
                onWheel={(e) => e.stopPropagation()}
              >
                <div
                  className="record-dialog"
                  role="dialog"
                  aria-modal="true"
                  style={{
                    width: "100%",
                    maxWidth: "460px",
                    padding: "24px",
                    background: "#ffffff",
                    borderRadius: "16px",
                    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
                    color: "#1c2b24",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    overscrollBehavior: "contain",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "18px",
                        fontWeight: "bold",
                        fontFamily: "var(--font-display, serif)",
                      }}
                    >
                      {lightboxPhoto?.caption ? "Editar descripción" : "Añadir descripción"}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setLightboxCaptionModalOpen(false)}
                      aria-label="Cerrar modal"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#666",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconClose style={{ width: 18, height: 18 }} />
                    </button>
                  </div>

                  <p style={{ margin: 0, fontSize: "13px", color: "var(--muted, #666)" }}>
                    Escribe un pie de foto o recuerdo para esta fotografía.
                  </p>

                  <textarea
                    autoFocus
                    placeholder="Añade una descripción..."
                    value={lightboxNewCaption}
                    onChange={(e) => setLightboxNewCaption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        onSaveCaption();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxCaptionModalOpen(false);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border, #dce4da)",
                      minHeight: "110px",
                      resize: "vertical",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      color: "inherit",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                      marginTop: "4px",
                    }}
                  >
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => setLightboxCaptionModalOpen(false)}
                      disabled={saving}
                      style={{ minWidth: "90px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="button"
                      style={{
                        backgroundColor: "var(--pine, #2E5C4B)",
                        color: "#ffffff",
                        minWidth: "100px",
                      }}
                      onClick={onSaveCaption}
                      disabled={saving}
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
        </>
      )}

      {selectedPhotosForEdit.length > 0 && (
        <div
          className="photo-batch-bar"
          style={{
            position: "fixed",
            bottom: "25px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100050,
            background: "#18342d",
            padding: "12px 24px",
            borderRadius: "100px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            color: "white",
            animation: "fadeUp 0.3s ease",
            pointerEvents: "auto",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 500 }}>
            <span className="hide-on-mobile">Seleccionadas: </span>
            {selectedPhotosForEdit.length}
          </span>

          <button
            type="button"
            title="Asignar o mover a registro"
            onClick={onOpenAssignModal}
            className="photo-batch-action"
            style={selectedPhotosForEdit.length > 4 ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            <IconFolderMove style={{ width: 16, height: 16 }} />
            <span className="hide-on-mobile">Mover</span>
          </button>

          <button
            type="button"
            title="Eliminar"
            onClick={onBatchDeletePhotos}
            className="photo-batch-action danger-icon"
          >
            <IconTrash style={{ width: 16, height: 16 }} />
            <span className="hide-on-mobile">Eliminar</span>
          </button>

          <button
            type="button"
            title="Cancelar"
            onClick={() => setSelectedPhotosForEdit([])}
            className="photo-batch-action ghost"
          >
            <IconClose style={{ width: 18, height: 18 }} />
            <span className="hide-on-mobile">Cancelar</span>
          </button>
        </div>
      )}

      {assignToRecordModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setAssignToRecordModalOpen(false)}
          onWheel={(e) => e.stopPropagation()}
          style={{ zIndex: 100060 }}
        >
          <div
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: "contain" }}
          >
            <h2>Asignar a registro</h2>
            <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "20px" }}>
              Selecciona el registro al que asignar {selectedPhotosForEdit.length} foto
              {selectedPhotosForEdit.length !== 1 ? "s" : ""}:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {selectedAscents.length > 0 ? (
                selectedAscents.map((ascent) => (
                  <button
                    key={ascent.achieved_on}
                    type="button"
                    className="button button--outline button--wide"
                    style={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => onAssignPhotosToRecord(ascent.achieved_on)}
                    disabled={saving}
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>{formatDate(ascent.achieved_on)}</span>
                  </button>
                ))
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "13px", margin: "4px 0 8px" }}>
                  Aún no tienes registros guardados en esta ubicación.
                </p>
              )}
              <button
                type="button"
                className="button button--outline button--wide"
                style={{
                  textAlign: "left",
                  justifyContent: "flex-start",
                  borderStyle: "dashed",
                }}
                onClick={onOpenNewRecordFromAssign}
                disabled={saving}
              >
                + Crear nuevo registro
              </button>
            </div>
            <button
              type="button"
              className="button button--quiet button--wide"
              style={{ marginTop: "16px" }}
              onClick={() => setAssignToRecordModalOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editorPhoto && (
        <PhotoEditor
          imageUrl={editorPhoto.public_url}
          onSave={onSaveEditedPhoto}
          onCancel={() => window.history.back()}
        />
      )}
    </>
  );
}
