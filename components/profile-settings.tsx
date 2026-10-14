"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { compressImage } from "@/lib/image-utils";
import { uploadPhotoBlob } from "@/lib/photo-client";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { DeleteAccountModal } from "./delete-account-modal";

type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_public: boolean;
  enable_peaks?: boolean;
  enable_countries?: boolean;
  enable_experiences?: boolean;
  share_photos?: boolean;
  share_notes?: boolean;
};

export function ProfileSettings({
  session,
  onClose,
  onProfileUpdate,
}: {
  session: Session;
  onClose: () => void;
  onProfileUpdate?: (profile: any) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [enablePeaks, setEnablePeaks] = useState(true);
  const [enableCountries, setEnableCountries] = useState(true);
  const [enableExperiences, setEnableExperiences] = useState(false);
  const [sharePhotos, setSharePhotos] = useState(true);
  const [shareNotes, setShareNotes] = useState(true);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (data) {
        setProfile(data);
        setUsername(data.username);
        setIsPublic(data.is_public);
        setEnablePeaks(data.enable_peaks ?? true);
        setEnableCountries(data.enable_countries ?? true);
        setEnableExperiences(data.enable_experiences ?? false);
        setSharePhotos(data.share_photos ?? true);
        setShareNotes(data.share_notes ?? true);
        if (data.avatar_url) setAvatarPreview(data.avatar_url);
      }
      setLoading(false);
    }
    loadProfile();
  }, [session]);

  useEffect(() => {
    lockScroll();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      unlockScroll();
    };
  }, []);

  const handleTogglePeaks = (checked: boolean) => {
    if (!checked && !enableCountries) {
      setError("Debes mantener activa al menos una modalidad (Picos o Países).");
      return;
    }
    setError("");
    setEnablePeaks(checked);
  };

  const handleToggleCountries = (checked: boolean) => {
    if (!checked && !enablePeaks) {
      setError("Debes mantener activa al menos una modalidad (Picos o Países).");
      return;
    }
    setError("");
    setEnableCountries(checked);
    if (!checked) {
      setEnableExperiences(false);
    }
  };

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    setSuccess("");

    if (!username.match(/^[a-zA-Z0-9_]{3,20}$/)) {
      setError(
        "El nombre de usuario debe tener entre 3 y 20 caracteres y solo letras, números o guiones bajos."
      );
      setSaving(false);
      return;
    }

    if (!enablePeaks && !enableCountries) {
      setError("Debes mantener activa al menos una modalidad (Picos o Países).");
      setSaving(false);
      return;
    }

    let avatarUrl = profile?.avatar_url || null;

    if (avatarFile) {
      if (!avatarFile.type.startsWith("image/")) {
        setError("El archivo seleccionado debe ser una imagen válida.");
        setSaving(false);
        return;
      }
      const compressedBlob = await compressImage(avatarFile, 256, 0.85);
      const ext = compressedBlob.type === "image/webp" ? "webp" : "jpg";

      try {
        const uploadResult = await uploadPhotoBlob({
          blob: compressedBlob,
          fileName: `avatar_${Date.now()}.${ext}`,
          summitId: "avatar",
          session,
          supabase,
        });
        avatarUrl = uploadResult.publicUrl;
      } catch (uploadErr: any) {
        setError(uploadErr.message || "Error al subir la foto de perfil.");
        setSaving(false);
        return;
      }
    }

    const updates = {
      id: session.user.id,
      username: username.toLowerCase(),
      avatar_url: avatarUrl,
      is_public: isPublic,
      enable_peaks: enablePeaks,
      enable_countries: enableCountries,
      enable_experiences: enableCountries ? enableExperiences : false,
      share_photos: sharePhotos,
      share_notes: shareNotes,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(updates);

    if (error) {
      setError(
        error.message.includes("unique")
          ? "Ese nombre de usuario ya está en uso."
          : error.message
      );
    } else {
      setSuccess("Perfil guardado correctamente.");
      if (onProfileUpdate) {
        onProfileUpdate(updates);
      }
      setTimeout(() => {
        onClose();
      }, 750);
    }
    setSaving(false);
  }

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={(e) => e.stopPropagation()}
        role="presentation"
      >
      <section
        className="auth-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          maxHeight: "96vh",
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          padding: "20px 20px 16px",
          maxWidth: "420px",
        }}
      >
        <button
          className="icon-button"
          aria-label="Cerrar"
          onClick={onClose}
          style={{ position: "absolute", right: "12px", top: "12px" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 22, height: 22 }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2 style={{ margin: "0 0 0.6rem", textAlign: "center", fontSize: "1.25rem" }}>
          Perfil
        </h2>

        {loading ? (
          <p style={{ textAlign: "center", margin: "1rem 0" }}>Cargando...</p>
        ) : (
          <form
            onSubmit={saveProfile}
            style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}
          >
            {/* Avatar & Username in compact horizontal row */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
              <div style={{ position: "relative", width: 54, height: 54, minWidth: 54 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    background: "#ccc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    position: "relative",
                    cursor: "pointer",
                    border: "2px solid var(--pine)",
                  }}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{ fontSize: "1.4rem", color: "white", fontWeight: "bold" }}
                    >
                      {username.charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                      }
                    }}
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                      cursor: "pointer",
                    }}
                    title="Toca para cambiar foto"
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.2rem",
                    fontWeight: "bold",
                    fontSize: "0.8rem",
                    color: "var(--ink)",
                  }}
                >
                  Nombre de usuario
                </label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "0.5rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#666",
                      fontSize: "0.85rem",
                    }}
                  >
                    @
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.replace(/^@/, ""))
                    }
                    placeholder="tu_usuario"
                    style={{
                      width: "100%",
                      padding: "0.35rem 0.5rem 0.35rem 1.6rem",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      fontSize: "0.88rem",
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Privacidad */}
            <div
              style={{
                background: "#f5f5f5",
                padding: "0.45rem 0.7rem",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <span style={{ fontWeight: "bold", fontSize: "0.82rem" }}>
                Privacidad
              </span>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>Perfil público</span>
                  <label className="custom-toggle">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    <div className="toggle-switch"></div>
                  </label>
                </div>
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "#666",
                    margin: "0.15rem 0 0 0",
                    lineHeight: 1.15,
                  }}
                >
                  {isPublic
                    ? "Cualquiera puede ver tus fotos y notas."
                    : "Solo tus seguidores pueden ver tus fotos y notas."}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.82rem" }}>Mostrar mis fotos</span>
                <label className="custom-toggle">
                  <input
                    type="checkbox"
                    checked={sharePhotos}
                    onChange={(e) => setSharePhotos(e.target.checked)}
                  />
                  <div className="toggle-switch"></div>
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.82rem" }}>Mostrar mis notas</span>
                <label className="custom-toggle">
                  <input
                    type="checkbox"
                    checked={shareNotes}
                    onChange={(e) => setShareNotes(e.target.checked)}
                  />
                  <div className="toggle-switch"></div>
                </label>
              </div>
            </div>

            {/* Modalidades y modos de la app */}
            <div
              style={{
                background: "#f5f5f5",
                padding: "0.45rem 0.7rem",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <span style={{ fontWeight: "bold", fontSize: "0.82rem" }}>
                Modalidades de la app
              </span>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.82rem" }}>Modo Picos</span>
                <label className="custom-toggle">
                  <input
                    type="checkbox"
                    checked={enablePeaks}
                    onChange={(e) => handleTogglePeaks(e.target.checked)}
                  />
                  <div className="toggle-switch"></div>
                </label>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.82rem" }}>Modo Países</span>
                <label className="custom-toggle">
                  <input
                    type="checkbox"
                    checked={enableCountries}
                    onChange={(e) => handleToggleCountries(e.target.checked)}
                  />
                  <div className="toggle-switch"></div>
                </label>
              </div>
              {/* Opciones dependientes de Países */}
              <div
                style={{
                  marginTop: "0.15rem",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  background: enableCountries ? "rgba(255, 255, 255, 0.9)" : "rgba(240, 240, 240, 0.6)",
                  border: enableCountries ? "1px solid rgba(0, 0, 0, 0.08)" : "1px dashed rgba(0, 0, 0, 0.14)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  opacity: enableCountries ? 1 : 0.55,
                  transition: "opacity 0.2s ease, background 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.1rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Opciones de Países
                  </span>
                  {!enableCountries && (
                    <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontStyle: "italic" }}>
                      Requiere Modo Países
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: enableCountries ? "inherit" : "var(--muted)" }}>
                    Modo Experiencias
                  </span>
                  <label
                    className="custom-toggle"
                    style={{ cursor: enableCountries ? "pointer" : "not-allowed" }}
                    title={enableCountries ? undefined : "Requiere tener activo el Modo Países"}
                  >
                    <input
                      type="checkbox"
                      checked={enableCountries && enableExperiences}
                      disabled={!enableCountries}
                      onChange={(e) => enableCountries && setEnableExperiences(e.target.checked)}
                    />
                    <div className="toggle-switch"></div>
                  </label>
                </div>
              </div>
            </div>

            {error && (
              <p
                style={{
                  color: "red",
                  margin: 0,
                  fontSize: "0.82rem",
                  lineHeight: 1.2,
                }}
              >
                {error}
              </p>
            )}
            {success && (
              <p
                style={{
                  color: "green",
                  margin: 0,
                  fontSize: "0.82rem",
                  lineHeight: 1.2,
                }}
              >
                {success}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.1rem" }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--danger, #a34f3d)",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  padding: "0",
                  textDecoration: "underline",
                  opacity: 0.9,
                  fontWeight: 600
                }}
              >
                Eliminar cuenta
              </button>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={async () => {
                    await supabase?.auth.signOut();
                    onClose();
                  }}
                  style={{
                    padding: "0.4rem 0.65rem",
                    fontSize: "0.82rem",
                  }}
                >
                  Cerrar sesión
                </button>
                <button
                  type="submit"
                  className="button button--green"
                  disabled={saving}
                  style={{
                    padding: "0.4rem 0.65rem",
                    fontSize: "0.82rem",
                  }}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          isOpen={showDeleteModal}
          username={username}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
