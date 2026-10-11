"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

interface PhotoEditorProps {
  imageUrl: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

export default function PhotoEditor({ imageUrl, onSave, onCancel }: PhotoEditorProps) {
  const [mounted, setMounted] = useState(false);
  const [safeSrc, setSafeSrc] = useState(imageUrl);
  const [isSaving, setIsSaving] = useState(false);

  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    width: 100,
    height: 100,
    x: 0,
    y: 0,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMounted(true);
    lockScroll();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      unlockScroll();
    };
  }, []);

  // Keyboard shortcut: Escape to cancel editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  // Safe image loader to prevent tainted canvas from browser cache
  useEffect(() => {
    let active = true;
    let localBlobUrl = "";

    async function prepareImage() {
      if (imageUrl && !imageUrl.startsWith("blob:") && !imageUrl.startsWith("data:")) {
        try {
          const res = await fetch(imageUrl, { mode: "cors" });
          if (!res.ok) throw new Error("Fetch failed");
          const blob = await res.blob();
          if (active) {
            localBlobUrl = URL.createObjectURL(blob);
            setSafeSrc(localBlobUrl);
          }
        } catch {
          if (active) {
            const sep = imageUrl.includes("?") ? "&" : "?";
            setSafeSrc(`${imageUrl}${sep}_t=${Date.now()}`);
          }
        }
      } else {
        setSafeSrc(imageUrl);
      }
    }

    prepareImage();

    return () => {
      active = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [imageUrl]);

  const handleRotate = useCallback(() => {
    setRotate((r) => (r + 90) % 360);
    setCrop({ unit: "%", width: 100, height: 100, x: 0, y: 0 });
    setCompletedCrop(undefined);
  }, []);

  const handleFlipH = useCallback(() => {
    setFlipHorizontal((f) => !f);
    setCrop({ unit: "%", width: 100, height: 100, x: 0, y: 0 });
    setCompletedCrop(undefined);
  }, []);

  const handleFlipV = useCallback(() => {
    setFlipVertical((f) => !f);
    setCrop({ unit: "%", width: 100, height: 100, x: 0, y: 0 });
    setCompletedCrop(undefined);
  }, []);

  const handleReset = useCallback(() => {
    setRotate(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setScale(1);
    setCrop({ unit: "%", width: 100, height: 100, x: 0, y: 0 });
    setCompletedCrop(undefined);
  }, []);

  async function handleSave() {
    if (!imgRef.current || isSaving) return;
    const image = imgRef.current;
    if (!image.naturalWidth || !image.naturalHeight) return;

    setIsSaving(true);
    try {
      const canvas = previewCanvasRef.current || document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsSaving(false);
        return;
      }

      // Scale from DOM to natural image size
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Use completedCrop if user deliberately created a crop, otherwise crop the whole image
      const hasValidCrop =
        completedCrop &&
        completedCrop.width > 10 &&
        completedCrop.height > 10;

      const cropX = hasValidCrop ? completedCrop.x * scaleX : 0;
      const cropY = hasValidCrop ? completedCrop.y * scaleY : 0;
      const cropWidth = hasValidCrop ? completedCrop.width * scaleX : image.naturalWidth;
      const cropHeight = hasValidCrop ? completedCrop.height * scaleY : image.naturalHeight;

      const isRotated90 = Math.abs(rotate % 180) === 90;
      const outputWidth = isRotated90 ? cropHeight : cropWidth;
      const outputHeight = isRotated90 ? cropWidth : cropHeight;

      // Limit output size to max 1600px dimension
      const MAX_DIM = 1600;
      let scaleOut = 1;
      if (Math.max(outputWidth, outputHeight) > MAX_DIM) {
        scaleOut = MAX_DIM / Math.max(outputWidth, outputHeight);
      }

      canvas.width = Math.round(outputWidth * scaleOut);
      canvas.height = Math.round(outputHeight * scaleOut);

      // Fill white background to prevent transparent pixels from becoming black when exported to JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale context to draw downsized output
      ctx.scale(scaleOut, scaleOut);
      ctx.translate(outputWidth / 2, outputHeight / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      ctx.translate(-cropWidth / 2, -cropHeight / 2);

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onSave(blob);
          } else {
            setIsSaving(false);
          }
        },
        "image/jpeg",
        0.85
      );
    } catch (err) {
      console.error("Error al procesar la foto:", err);
      setIsSaving(false);
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="photo-editor-modal"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#000000",
        zIndex: 100050,
        display: "flex",
        flexDirection: "column",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          backgroundColor: "#0a0a0a",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          zIndex: 10,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            background: "transparent",
            border: "none",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 500,
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: "6px",
          }}
        >
          Cancelar
        </button>

        <span style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.02em" }}>
          Editar foto
        </span>

        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            background: "#ffffff",
            border: "none",
            color: "#000000",
            fontSize: "14px",
            fontWeight: 600,
            padding: "8px 20px",
            borderRadius: "20px",
            cursor: isSaving ? "not-allowed" : "pointer",
            opacity: isSaving ? 0.7 : 1,
            transition: "all 0.2s ease",
          }}
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {/* Main Edit Area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          backgroundColor: "#000000",
        }}
      >
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c)}
        >
          <img
            ref={imgRef}
            src={safeSrc}
            alt="Editor de foto"
            crossOrigin="anonymous"
            style={{
              transform: `scale(${scale}) rotate(${rotate}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`,
              maxHeight: "68vh",
              maxWidth: "92vw",
              objectFit: "contain",
              transition: "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
              display: "block",
            }}
          />
        </ReactCrop>
      </div>

      {/* Bottom Toolbar */}
      <div
        className="photo-editor-toolbar"
        style={{
          padding: "16px 12px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "clamp(8px, 4vw, 36px)",
          backgroundColor: "#0a0a0a",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          zIndex: 10,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={handleRotate}
          title="Rotar 90° en sentido horario"
          style={{
            background: "transparent",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "8px",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          <span className="photo-editor-btn-label" style={{ fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>Rotar</span>
        </button>

        <button
          onClick={handleFlipH}
          title="Voltear horizontalmente"
          style={{
            background: "transparent",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "8px",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20v-2" />
            <path d="M12 14v-2" />
            <path d="M12 8V6" />
            <path d="M12 2v2" />
            <path d="M17 22l5-5-5-5v10z" />
            <path d="M7 22L2 17l5-5v10z" />
          </svg>
          <span className="photo-editor-btn-label" style={{ fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{"Espejo\u00A0H"}</span>
        </button>

        <button
          onClick={handleFlipV}
          title="Voltear verticalmente"
          style={{
            background: "transparent",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "8px",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12h2" />
            <path d="M10 12h2" />
            <path d="M16 12h2" />
            <path d="M22 12h-2" />
            <path d="M2 17l5 5 5-5H2z" />
            <path d="M2 7l5-5 5 5H2z" />
          </svg>
          <span className="photo-editor-btn-label" style={{ fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{"Espejo\u00A0V"}</span>
        </button>

        <button
          onClick={handleReset}
          title="Restablecer cambios"
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255, 255, 255, 0.75)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "8px",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span className="photo-editor-btn-label" style={{ fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>Restablecer</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
