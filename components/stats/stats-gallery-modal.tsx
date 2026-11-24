"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { Camera, X } from "lucide-react";
import { getLocationInfo } from "@/lib/stats-utils";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import type { StatsMode } from "@/components/stats-modal";

const PhotoLightbox = dynamic(
  () => import("@/components/photo-lightbox").then((m) => m.PhotoLightbox),
  { ssr: false }
);

interface StatsGalleryModalProps {
  activeMode: StatsMode;
  targetUsername?: string | null;
  sortedPhotos: any[];
  sortOrder: "desc" | "asc";
  lightboxIndex: number | null;
  onSortOrderChange: (order: "desc" | "asc") => void;
  onOpenLightbox: (idx: number) => void;
  onIndexChange: (idx: number) => void;
  onCloseGallery: () => void;
  onCloseLightbox: () => void;
  onGoToRecord: (summitId?: string) => void;
}

export function StatsGalleryModal({
  activeMode,
  targetUsername,
  sortedPhotos,
  sortOrder,
  lightboxIndex,
  onSortOrderChange,
  onOpenLightbox,
  onIndexChange,
  onCloseGallery,
  onCloseLightbox,
  onGoToRecord,
}: StatsGalleryModalProps) {
  const lightboxPhotos = useMemo(
    () =>
      sortedPhotos.map((p) => ({
        ...p,
        public_url: getPhotoDisplayUrl(p.public_url || p.url, p.storage_path),
      })),
    [sortedPhotos]
  );

  const activeLightboxPhoto = lightboxIndex !== null ? sortedPhotos[lightboxIndex] : null;
  const activeLocationInfo = activeLightboxPhoto
    ? getLocationInfo(activeLightboxPhoto.summit_id)
    : null;

  return (
    <>
      <div className="stats-gallery-overlay" role="dialog" aria-modal="true">
        <header className="stats-header stats-header--gallery">
          <h2 className="stats-header-title">
            {targetUsername ? `Galería de @${targetUsername}` : "Galería de Recuerdos"}
          </h2>
          <button
            type="button"
            className="stats-close-btn"
            onClick={onCloseGallery}
            aria-label="Cerrar galería"
          >
            <X size={18} />
          </button>
        </header>

        <main className="stats-gallery-content">
          {sortedPhotos.length === 0 ? (
            <div className="stats-gallery-empty">
              <Camera size={40} className="stats-gallery-empty-icon" />
              <h3 className="stats-gallery-empty-title">
                {activeMode === "peaks"
                  ? "Sin recuerdos de picos aún"
                  : activeMode === "experiences"
                  ? "Sin recuerdos de experiencias aún"
                  : "Sin recuerdos de países aún"}
              </h3>
              <p className="stats-gallery-empty-text">
                {targetUsername
                  ? activeMode === "peaks"
                    ? `@${targetUsername} aún no ha añadido fotos a sus picos provinciales.`
                    : activeMode === "experiences"
                    ? `@${targetUsername} aún no ha añadido fotos a sus experiencias.`
                    : `@${targetUsername} aún no ha añadido fotos a sus viajes por el mundo.`
                  : activeMode === "peaks"
                  ? "Añade fotos a tus picos provinciales desde sus fichas en el mapa para verlas todas aquí."
                  : activeMode === "experiences"
                  ? "Añade fotos a tus experiencias desde sus fichas en el mapa para verlas todas aquí."
                  : "Añade fotos a tus viajes por el mundo desde sus fichas en el mapa para verlas todas aquí."}
              </p>
            </div>
          ) : (
            <>
              <div className="stats-gallery-toolbar">
                <span className="stats-gallery-count">{sortedPhotos.length} fotos</span>
                <div className="stats-gallery-sort-wrap" role="group" aria-label="Ordenar fotos">
                  <button
                    type="button"
                    className={`stats-gallery-sort-btn ${
                      sortOrder === "desc" ? "stats-gallery-sort-btn--active" : ""
                    }`}
                    onClick={() => onSortOrderChange("desc")}
                  >
                    Más recientes
                  </button>
                  <button
                    type="button"
                    className={`stats-gallery-sort-btn ${
                      sortOrder === "asc" ? "stats-gallery-sort-btn--active" : ""
                    }`}
                    onClick={() => onSortOrderChange("asc")}
                  >
                    Más antiguas
                  </button>
                </div>
              </div>

              <div className="stats-gallery-grid">
                {sortedPhotos.map((photo, idx) => {
                  const loc = getLocationInfo(photo.summit_id);
                  return (
                    <button
                      key={photo.id || idx}
                      type="button"
                      className="stats-gallery-item"
                      onClick={() => onOpenLightbox(idx)}
                      aria-label={`Ver foto de ${loc.name}`}
                    >
                      <img
                        src={getPhotoDisplayUrl(photo.public_url || photo.url, photo.storage_path)}
                        alt={photo.caption || loc.name}
                        loading="lazy"
                        decoding="async"
                        className="stats-gallery-img"
                      />
                      <span className="stats-gallery-item-tag">{loc.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {lightboxIndex !== null && activeLightboxPhoto && activeLocationInfo && (
        <PhotoLightbox
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          onIndexChange={onIndexChange}
          onClose={onCloseLightbox}
          title={activeLocationInfo.name}
          onTitleClick={() => onGoToRecord(activeLightboxPhoto.summit_id)}
          canEdit={false}
          showDots={false}
        />
      )}
    </>
  );
}
