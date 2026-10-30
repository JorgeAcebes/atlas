"use client";

import React, { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { IconLogo } from "@/components/icons";
import { useScrollLock } from "@/lib/scroll-lock";
import { X, Share2, Copy, Check } from "lucide-react";

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  url?: string;
  title?: string;
  text?: string;
}

export function QrModal({
  isOpen,
  onClose,
  url,
  title = "Únete a Atlas",
  text = "¡Únete a Atlas! Registra tus países visitados, experiencias y picos.",
}: QrModalProps) {
  useScrollLock(isOpen);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const targetUrl =
    url || (typeof window !== "undefined" ? window.location.origin : "https://atlas.app");

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 400,
      color: {
        dark: "#18342d",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (isMounted) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((err) => {
        console.error("Error generating QR code:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetUrl]);

  const handleCopy = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${text} ${targetUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (err) {
        console.error("Failed to copy link:", err);
      }
    }
  }, [text, targetUrl]);

  const handleShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: targetUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    handleCopy();
  }, [title, text, targetUrl, handleCopy]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        zIndex: 10200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="qr-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Código QR para unirse a Atlas"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "380px",
          background: "var(--paper, #fffdf9)",
          borderRadius: "18px",
          padding: "28px 24px 24px",
          boxShadow: "0 20px 45px rgba(22, 61, 50, 0.22)",
          border: "1px solid var(--line, #e2ded5)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Cerrar modal"
          style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            padding: "4px",
            color: "var(--muted, #64748b)",
          }}
        >
          <X size={20} />
        </button>

        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "24px",
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--ink, #18342d)",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: "13px",
            lineHeight: 1.45,
            color: "var(--muted, #64748b)",
            margin: "0 0 20px",
            maxWidth: "300px",
          }}
        >
          Escanea el código con la cámara de tu móvil para acceder y registrar tus países, picos y experiencias.
        </p>

        {/* QR Code Container with Centered Logo */}
        <div
          className="qr-code-wrapper"
          style={{
            position: "relative",
            width: "220px",
            height: "220px",
            background: "#ffffff",
            padding: "10px",
            borderRadius: "16px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
            border: "1px solid var(--line, #e2ded5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
          }}
        >
          {qrDataUrl ? (
            <>
              <img
                src={qrDataUrl}
                alt="Código QR de Atlas"
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  borderRadius: "10px",
                }}
              />
              {/* App logo badge centered inside QR code */}
              <div
                className="qr-code-center-logo"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  background: "#ffffff",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.16)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2.5px solid #ffffff",
                  pointerEvents: "none",
                }}
              >
                <IconLogo style={{ width: "32px", height: "32px" }} />
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              Generando QR...
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            width: "100%",
          }}
        >
          <button
            type="button"
            className="button button--green"
            onClick={handleShare}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              fontSize: "13px",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 600,
            }}
          >
            <Share2 size={16} />
            Compartir
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={handleCopy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              fontSize: "13px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid var(--line, #e2ded5)",
              background: "#ffffff",
              color: "var(--ink, #18342d)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
