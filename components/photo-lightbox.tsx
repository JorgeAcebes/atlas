"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react";

export interface LightboxPhoto {
  id?: string;
  public_url: string;
  caption?: string | null;
  [key: string]: any;
}

export interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  currentIndex: number;
  onIndexChange: (newIndex: number) => void;
  onClose: () => void;
  title: string;
  canEdit?: boolean;
  onEditPhoto?: (photo: LightboxPhoto) => void;
  onEditCaption?: (photo: LightboxPhoto) => void;
  onDeletePhoto?: (photo: LightboxPhoto) => void;
}

export function PhotoLightbox({
  photos,
  currentIndex,
  onIndexChange,
  onClose,
  title,
  canEdit = false,
  onEditPhoto,
  onEditCaption,
  onDeletePhoto,
}: PhotoLightboxProps) {
  const currentPhoto = photos[currentIndex];

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    document.body.classList.add("lightbox-open");
    return () => {
      document.body.classList.remove("lightbox-open");
    };
  }, []);

  // Zoom & Pan state (fully functional in background without visual zoom pill)
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // References for drag/pan and touch gestures
  const stageRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pinchDistRef = useRef<number | null>(null);
  const pinchScaleRef = useRef(1);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const touchStartSwipeRef = useRef<{ x: number; y: number } | null>(null);

  // Reset zoom & pan when navigating to another photo
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setMenuOpen(false);
  }, [currentIndex]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const showPrev = useCallback(() => {
    if (hasPrev) {
      onIndexChange(currentIndex - 1);
    }
  }, [hasPrev, currentIndex, onIndexChange]);

  const showNext = useCallback(() => {
    if (hasNext) {
      onIndexChange(currentIndex + 1);
    }
  }, [hasNext, currentIndex, onIndexChange]);

  // Clamping pan bounds based on stage dimensions and current zoom scale
  const clampPan = useCallback((x: number, y: number, currentScale: number) => {
    if (!stageRef.current || currentScale <= 1) {
      return { x: 0, y: 0 };
    }
    const stageWidth = stageRef.current.clientWidth;
    const stageHeight = stageRef.current.clientHeight;

    const maxPanX = Math.max(0, (stageWidth * (currentScale - 1)) / 2 + 40);
    const maxPanY = Math.max(0, (stageHeight * (currentScale - 1)) / 2 + 40);

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => {
      const next = Math.min(4, Number((prev + 0.5).toFixed(2)));
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(2)));
      if (next <= 1.02) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      setPan((currentPan) => clampPan(currentPan.x, currentPan.y, next));
      return next;
    });
  }, [clampPan]);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        onClose();
      } else if (e.key === "ArrowLeft") {
        if (scale <= 1.05) {
          showPrev();
        }
      } else if (e.key === "ArrowRight") {
        if (scale <= 1.05) {
          showNext();
        }
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetZoom();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, scale, showPrev, showNext, handleZoomIn, handleZoomOut, handleResetZoom, menuOpen]);

  // Wheel zoom with passive: false to prevent background scroll
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      setScale((prevScale) => {
        const nextScale = Math.min(4, Math.max(1, prevScale * factor));
        if (nextScale <= 1.05) {
          setPan({ x: 0, y: 0 });
          return 1;
        }
        setPan((currentPan) => clampPan(currentPan.x, currentPan.y, nextScale));
        return Number(nextScale.toFixed(2));
      });
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [clampPan]);

  // Double click / Double tap handler
  const handleDoubleTap = useCallback(
    (clientX: number, clientY: number) => {
      setIsInteracting(false);
      if (scaleRef.current > 1.05) {
        handleResetZoom();
      } else {
        const targetScale = 2.5;
        if (stageRef.current) {
          const rect = stageRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const offsetX = clientX - centerX;
          const offsetY = clientY - centerY;
          const newPan = clampPan(-offsetX * (targetScale - 1), -offsetY * (targetScale - 1), targetScale);
          setScale(targetScale);
          setPan(newPan);
        } else {
          setScale(targetScale);
        }
      }
    },
    [clampPan, handleResetZoom]
  );

  // Mouse pan event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (scale > 1) {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsInteracting(true);
      dragStartRef.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const nextX = e.clientX - dragStartRef.current.x;
    const nextY = e.clientY - dragStartRef.current.y;
    setPan(clampPan(nextX, nextY, scale));
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsInteracting(false);
    }
  };

  // Touch event handlers (Pinch, Pan & Swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch to zoom
      isDraggingRef.current = false;
      setIsInteracting(true);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchDistRef.current = dist;
      pinchScaleRef.current = scaleRef.current;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();

      // If there's a recent tap nearby, this could be the second tap of a double-tap.
      // Suppress drag/swipe setup so we can confirm the double-tap on touchEnd.
      if (
        lastTapRef.current &&
        now - lastTapRef.current.time < 380 &&
        Math.hypot(touch.clientX - lastTapRef.current.x, touch.clientY - lastTapRef.current.y) < 45
      ) {
        touchStartSwipeRef.current = null;
        isDraggingRef.current = false;
      } else if (scaleRef.current > 1.05) {
        isDraggingRef.current = true;
        setIsInteracting(true);
        dragStartRef.current = {
          x: touch.clientX - pan.x,
          y: touch.clientY - pan.y,
        };
      } else {
        touchStartSwipeRef.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / pinchDistRef.current;
      const nextScale = Math.min(4, Math.max(1, pinchScaleRef.current * ratio));
      setScale(nextScale);
      if (nextScale <= 1.05) {
        setPan({ x: 0, y: 0 });
      } else {
        setPan((currentPan) => clampPan(currentPan.x, currentPan.y, nextScale));
      }
    } else if (e.touches.length === 1 && isDraggingRef.current && scaleRef.current > 1.05) {
      const touch = e.touches[0];
      const nextX = touch.clientX - dragStartRef.current.x;
      const nextY = touch.clientY - dragStartRef.current.y;
      setPan(clampPan(nextX, nextY, scaleRef.current));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsInteracting(false);
    pinchDistRef.current = null;
    isDraggingRef.current = false;

    // Ignore if another finger is still on screen (e.g. releasing one finger from a pinch)
    if (e.touches.length > 0) return;

    const changedTouch = e.changedTouches[0];
    if (!changedTouch) {
      touchStartSwipeRef.current = null;
      return;
    }

    const now = Date.now();

    // Double-tap detection: confirm here on touchEnd so zoom fires on finger-lift (no hold needed)
    if (
      lastTapRef.current &&
      now - lastTapRef.current.time < 380 &&
      Math.hypot(changedTouch.clientX - lastTapRef.current.x, changedTouch.clientY - lastTapRef.current.y) < 45
    ) {
      lastTapRef.current = null;
      touchStartSwipeRef.current = null;
      handleDoubleTap(changedTouch.clientX, changedTouch.clientY);
      return;
    }

    // Record this tap for double-tap detection on next touchEnd
    lastTapRef.current = { time: now, x: changedTouch.clientX, y: changedTouch.clientY };

    if (scaleRef.current < 1.05) {
      setScale(1);
      setPan({ x: 0, y: 0 });

      // Swipe navigation when at 1x scale
      if (touchStartSwipeRef.current) {
        const diffX = changedTouch.clientX - touchStartSwipeRef.current.x;
        const diffY = changedTouch.clientY - touchStartSwipeRef.current.y;

        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0 && hasNext) {
            showNext();
          } else if (diffX > 0 && hasPrev) {
            showPrev();
          }
        }
      }
    }
    touchStartSwipeRef.current = null;
  };

  if (!currentPhoto || !mounted) return null;

  return createPortal(
    <div
      className="lightbox-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#000000",
        overflow: "hidden",
        cursor: "default",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
      onClick={(e) => {
        // Prevent accidental closing when clicking anywhere on the black background
        e.stopPropagation();
        if (menuOpen) setMenuOpen(false);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Top-Right Controls: Menú de opciones (si editable) y Cruz de cerrar ── */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 28,
          zIndex: 100010,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {canEdit && (
          <div style={{ position: "relative" }}>
            <button
              className="lightbox-menu-btn"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              aria-label="Opciones de foto"
              style={{
                position: "relative",
                top: "auto",
                right: "auto",
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "rgba(0, 0, 0, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                color: "rgba(255, 255, 255, 0.95)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <MoreVertical size={20} />
            </button>

            {menuOpen && (
              <div
                className="lightbox-dropdown"
                style={{
                  position: "absolute",
                  top: "48px",
                  right: "0",
                  zIndex: 100020,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {onEditPhoto && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEditPhoto(currentPhoto);
                    }}
                  >
                    Editar foto
                  </button>
                )}
                {onEditCaption && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEditCaption(currentPhoto);
                    }}
                  >
                    Descripción
                  </button>
                )}
                {onDeletePhoto && (
                  <button
                    className="danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePhoto(currentPhoto);
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Close Button: Arriba a la derecha con mismo fondo oscuro que las flechas laterales */}
        <button
          className="lightbox-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Cerrar imagen"
          style={{
            position: "relative",
            top: "auto",
            right: "auto",
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: "rgba(0, 0, 0, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "rgba(255, 255, 255, 0.95)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
        >
          <X size={22} strokeWidth={2.2} />
        </button>
      </div>

      {/* ── Main Stage: Centrado vertical y horizontal óptico perfecto ── */}
      <main
        ref={stageRef}
        className="lightbox-stage"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          touchAction: "none",
          paddingTop: "50px",
          paddingBottom: "115px",
          boxSizing: "border-box",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={(e) => handleDoubleTap(e.clientX, e.clientY)}
        onClick={(e) => {
          // Clicking anywhere in the stage background does NOT dismiss the lightbox
          e.stopPropagation();
          if (menuOpen) setMenuOpen(false);
        }}
      >
        {/* Navigation Arrows (Desktop) */}
        {hasPrev && (
          <button
            className="lightbox-nav lightbox-nav--prev"
            onClick={(e) => {
              e.stopPropagation();
              showPrev();
            }}
            aria-label="Foto anterior"
            style={{
              position: "absolute",
              left: 28,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10006,
            }}
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {hasNext && (
          <button
            className="lightbox-nav lightbox-nav--next"
            onClick={(e) => {
              e.stopPropagation();
              showNext();
            }}
            aria-label="Foto siguiente"
            style={{
              position: "absolute",
              right: 28,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10006,
            }}
          >
            <ChevronRight size={28} />
          </button>
        )}

        {/* Scaled & Translated Image Container: Centrado exacto sin desplazamiento */}
        <div
          className="lightbox-img-wrapper"
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${scale})`,
            transformOrigin: "center center",
            transition: isInteracting ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
            cursor: scale > 1 ? (isDraggingRef.current ? "grabbing" : "grab") : "zoom-in",
          }}
        >
          <img
            key={currentPhoto.id || currentIndex}
            src={currentPhoto.public_url}
            alt={title || "Foto"}
            className="lightbox-image"
            draggable={false}
            style={{
              maxWidth: "min(92vw, 1200px)",
              maxHeight: "calc(100dvh - 210px)",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              pointerEvents: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              display: "block",
              margin: "auto",
            }}
          />
        </div>
      </main>

      {/* ── Bottom Information Card: Título de alta visibilidad, contraste nítido y dots ── */}
      <footer
        className="lightbox-footer"
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100010,
          pointerEvents: "none",
          padding: "0 16px",
        }}
      >
        <div
          className="lightbox-info-card"
          style={{
            pointerEvents: "auto",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            padding: "8px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            maxWidth: "min(92vw, 680px)",
            textAlign: "center",
            boxShadow: "none",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Caption personalizada si existe */}
          {currentPhoto.caption && (
            <strong
              style={{
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 600,
                lineHeight: "1.4",
                display: "block",
                wordBreak: "break-word",
                textShadow: "0 2px 4px rgba(0, 0, 0, 0.8)",
              }}
            >
              {currentPhoto.caption}
            </strong>
          )}

          {/* Nombre del lugar / cumbre / país / experiencia en blanco puro */}
          {title && (
            <span
              style={{
                color: "#ffffff",
                fontSize: currentPhoto.caption ? "13px" : "16px",
                fontWeight: currentPhoto.caption ? 400 : 600,
                lineHeight: "1.35",
                letterSpacing: "0.015em",
                opacity: currentPhoto.caption ? 0.9 : 1,
                textShadow: "0 2px 4px rgba(0, 0, 0, 0.8)",
              }}
            >
              {title}
            </span>
          )}

          {/* Puntos de paginación interactivos */}
          {photos.length > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                marginTop: "4px",
              }}
            >
              {photos.map((photo, idx) => (
                <button
                  key={photo.id || idx}
                  onClick={() => onIndexChange(idx)}
                  aria-label={`Ir a foto ${idx + 1}`}
                  style={{
                    width: idx === currentIndex ? "20px" : "7px",
                    height: "7px",
                    borderRadius: "4px",
                    border: "none",
                    padding: 0,
                    backgroundColor:
                      idx === currentIndex
                        ? "#ffffff"
                        : "rgba(255, 255, 255, 0.35)",
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>,
    document.body
  );
}
