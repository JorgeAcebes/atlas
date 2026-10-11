"use client";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmModal({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmText = "Eliminar",
  cancelText = "Cancelar",
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    lockScroll();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      unlockScroll();
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, onCancel]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100060,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onCancel}
      onWheel={(e) => e.stopPropagation()}
    >
      <section
        className="record-dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          padding: "32px 24px",
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
          overscrollBehavior: "contain",
          color: "#1c2b24",
        }}
      >
        <h3 style={{ margin: "0 0 24px 0", fontSize: 18, fontWeight: 600 }}>{message}</h3>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="button button--quiet" onClick={onCancel} style={{ flex: 1 }}>
            {cancelText}
          </button>
          <button
            className="button"
            style={{ flex: 1, backgroundColor: "var(--danger, #a34f3d)", color: "#fff" }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
