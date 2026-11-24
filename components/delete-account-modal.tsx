"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

interface DeleteAccountModalProps {
  isOpen: boolean;
  username: string;
  onClose: () => void;
}

export function DeleteAccountModal({
  isOpen,
  username,
  onClose,
}: DeleteAccountModalProps) {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const expectedText = `atlas-${(username || "").toLowerCase().trim()}`;
  const isMatch = confirmationInput.trim().toLowerCase() === expectedText;

  useEffect(() => {
    if (!isOpen) return;
    setConfirmationInput("");
    setErrorMessage("");
    setIsDeleting(false);

    lockScroll();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      unlockScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  async function handleDelete() {
    if (!isMatch || !supabase) return;
    setIsDeleting(true);
    setErrorMessage("");

    try {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (sessionErr || !sessionData.session) {
        throw new Error("No se ha podido verificar tu sesión activa.");
      }

      const token = sessionData.session.access_token;
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Error al eliminar la cuenta");
      }

      // Cerrar sesión en el cliente y purgar almacenamiento local
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("app_user_profile");
          sessionStorage.clear();
        } catch {}
        window.location.href = "/";
      }
    } catch (err: any) {
      console.error("Error deleting account:", err);
      setErrorMessage(
        err.message || "Ocurrió un error inesperado al eliminar tu cuenta."
      );
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 3500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(3px)",
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="record-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "1.75rem 1.5rem",
          backgroundColor: "var(--paper, #faf8f1)",
          color: "var(--ink, #18342d)",
          borderRadius: "8px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "1.1rem",
        }}
      >
        {/* Cabecera con advertencia */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "rgba(163, 79, 61, 0.12)",
              color: "var(--danger, #a34f3d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h2
              id="delete-account-title"
              style={{
                margin: 0,
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--danger, #a34f3d)",
                fontFamily: "'Playfair Display', Georgia, serif",
              }}
            >
              ¿Eliminar cuenta definitivamente?
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                color: "var(--muted, #62716b)",
              }}
            >
              Esta acción es permanente e irreversible.
            </p>
          </div>
        </div>

        {/* Caja de consecuencias detalladas */}
        <div
          style={{
            backgroundColor: "rgba(163, 79, 61, 0.06)",
            border: "1px solid rgba(163, 79, 61, 0.2)",
            borderRadius: "6px",
            padding: "0.85rem 1rem",
            fontSize: "0.84rem",
            lineHeight: 1.5,
          }}
        >
          <strong
            style={{
              display: "block",
              marginBottom: "0.4rem",
              color: "var(--danger, #a34f3d)",
            }}
          >
            Consecuencias de eliminar tu cuenta:
          </strong>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.15rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.3rem",
            }}
          >
            <li>
              Se borrarán de inmediato todas tus <strong>cumbres, países y experiencias</strong> registradas.
            </li>
            <li>
              Se eliminarán de forma permanente todas tus <strong>fotografías subidas</strong>.
            </li>
            <li>
              Se purgarán todas tus <strong>notas personales</strong> y fechas de ascenso.
            </li>
            <li>
              Desaparecerán tus registros del <strong>feed comunitario</strong> y tu posición en el <strong>ranking</strong>.
            </li>
            <li>
              Tu nombre de usuario (<strong>@{username}</strong>) quedará liberado.
            </li>
          </ul>
        </div>

        {/* Campo de confirmación con texto exacto */}
        <div>
          <label
            htmlFor="delete-confirmation-input"
            style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 600,
              marginBottom: "0.45rem",
              color: "var(--ink, #18342d)",
            }}
          >
            Para confirmar, escribe{" "}
            <code
              style={{
                backgroundColor: "var(--sand, #f0eadc)",
                padding: "2px 6px",
                borderRadius: "4px",
                color: "var(--danger, #a34f3d)",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
              }}
            >
              {expectedText}
            </code>
            :
          </label>
          <input
            id="delete-confirmation-input"
            type="text"
            disabled={isDeleting}
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && isMatch && !isDeleting) {
                e.preventDefault();
                handleDelete();
              }
            }}
            placeholder={expectedText}
            autoComplete="off"
            spellCheck="false"
            style={{
              width: "100%",
              padding: "0.6rem 0.75rem",
              fontSize: "0.9rem",
              borderRadius: "4px",
              border: `1.5px solid ${isMatch ? "var(--danger, #a34f3d)" : "var(--line, #dce4da)"}`,
              fontFamily: "'DM Mono', monospace",
              outline: "none",
              backgroundColor: "#ffffff",
              color: "var(--ink, #18342d)",
            }}
          />
        </div>

        {errorMessage && (
          <p
            style={{
              margin: 0,
              fontSize: "0.82rem",
              color: "var(--danger, #a34f3d)",
              fontWeight: 500,
            }}
          >
            {errorMessage}
          </p>
        )}

        {/* Botones de acción */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginTop: "0.5rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="button button--outline"
            disabled={isDeleting}
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.85rem",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button"
            disabled={!isMatch || isDeleting}
            onClick={handleDelete}
            style={{
              padding: "0.5rem 1.1rem",
              fontSize: "0.85rem",
              backgroundColor: isMatch ? "var(--danger, #a34f3d)" : "#ccc",
              color: "#ffffff",
              cursor: isMatch && !isDeleting ? "pointer" : "not-allowed",
              border: "none",
              fontWeight: 600,
            }}
          >
            {isDeleting ? "Eliminando cuenta…" : "Eliminar mi cuenta definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
