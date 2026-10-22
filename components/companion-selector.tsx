import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./auth-context";
import { CompanionProfile, getMutualFollowers } from "@/lib/companions";
import { Users, UserPlus, X, Check, Clock, Search } from "lucide-react";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

interface CompanionSelectorProps {
  mode: "peaks" | "countries" | "experience";
  selectedCompanions: CompanionProfile[];
  onChange: (companions: CompanionProfile[]) => void;
  existingStatuses?: Record<string, "pending" | "accepted" | "rejected" | "separated">;
}

export function CompanionSelector({
  mode,
  selectedCompanions,
  onChange,
  existingStatuses = {},
}: CompanionSelectorProps) {
  const { session } = useAuth();
  const [mutualFollowers, setMutualFollowers] = useState<CompanionProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState<CompanionProfile[]>([]);
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const label =
    selectedCompanions.length === 1
      ? mode === "peaks"
        ? "Compañero de ruta"
        : mode === "countries"
        ? "Compañero de viaje"
        : "Compañero de experiencia"
      : mode === "peaks"
      ? "Compañeros de ruta"
      : mode === "countries"
      ? "Compañeros de viaje"
      : "Compañeros de experiencia";

  const modalTitle =
    tempSelected.length === 1
      ? mode === "peaks"
        ? "Compañero de ruta"
        : mode === "countries"
        ? "Compañero de viaje"
        : "Compañero de experiencia"
      : mode === "peaks"
      ? "Compañeros de ruta"
      : mode === "countries"
      ? "Compañeros de viaje"
      : "Compañeros de experiencia";

  const pillButtonText =
    mode === "peaks"
      ? "Añadir compañeros de ruta"
      : mode === "countries"
      ? "Añadir compañeros de viaje"
      : "Añadir compañeros de experiencia";

  useEffect(() => {
    if (!session) return;
    let isSubscribed = true;
    setLoading(true);

    getMutualFollowers(session.user.id).then((followers) => {
      if (isSubscribed) {
        setMutualFollowers(followers);
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [session]);

  const handleOpenModal = () => {
    setTempSelected([...selectedCompanions]);
    setSearch("");
    setIsModalOpen(true);
    lockScroll();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    unlockScroll();
  };

  const handleSaveModal = () => {
    onChange(tempSelected);
    setIsModalOpen(false);
    unlockScroll();
  };

  // Keyboard navigation: Escape closes this popup without bubbling to parent modal
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleCloseModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isModalOpen]);

  const tempSelectedIds = useMemo(
    () => new Set(tempSelected.map((c) => c.id)),
    [tempSelected]
  );

  const filteredFollowers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mutualFollowers;
    return mutualFollowers.filter((f) => f.username.toLowerCase().includes(q));
  }, [mutualFollowers, search]);

  const handleToggleCompanion = (follower: CompanionProfile) => {
    if (tempSelectedIds.has(follower.id)) {
      setTempSelected((prev) => prev.filter((c) => c.id !== follower.id));
    } else {
      if (tempSelected.length >= 29) return; // Max 29 companions (30 total with creator)
      setTempSelected((prev) => [...prev, follower]);
    }
  };

  const handleRemoveChip = (id: string) => {
    onChange(selectedCompanions.filter((c) => c.id !== id));
  };

  return (
    <div className="field-label" style={{ marginBottom: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <Users size={16} style={{ color: "var(--pine, #2d5a43)" }} />
          <span>{label}</span>
        </span>
        {selectedCompanions.length > 0 && (
          <span style={{ fontSize: "11px", color: "var(--muted, #6b7280)" }}>
            {selectedCompanions.length} compañero{selectedCompanions.length !== 1 ? "s" : ""} ({selectedCompanions.length + 1} / 30)
          </span>
        )}
      </div>

      {/* Selected companions chips */}
      {selectedCompanions.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "8px",
          }}
        >
          {selectedCompanions.map((comp) => {
            const status = existingStatuses[comp.id];
            return (
              <div
                key={comp.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "color-mix(in srgb, var(--pine, #2d5a43) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--pine, #2d5a43) 24%, transparent)",
                  borderRadius: "20px",
                  padding: "3px 8px 3px 4px",
                  fontSize: "12px",
                  color: "var(--ink, #1f2937)",
                }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: "var(--pine, #2d5a43)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {comp.avatar_url ? (
                    <img
                      src={comp.avatar_url}
                      alt={comp.username}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    comp.username.charAt(0).toUpperCase()
                  )}
                </div>
                <span style={{ fontWeight: 600 }}>@{comp.username}</span>

                {status === "accepted" && (
                  <span
                    title="Invitación aceptada"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      color: "#2e7d32",
                      fontSize: "10px",
                    }}
                  >
                    <Check size={12} />
                  </span>
                )}
                {status === "pending" && (
                  <span
                    title="Pendiente de confirmación"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      color: "#b45309",
                      fontSize: "10px",
                    }}
                  >
                    <Clock size={11} />
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveChip(comp.id)}
                  title="Quitar compañero"
                  aria-label={`Quitar @${comp.username}`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    marginLeft: "2px",
                    color: "var(--muted, #6b7280)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Compact Pill Button to open companion popup */}
      <div>
        <button
          type="button"
          onClick={handleOpenModal}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: selectedCompanions.length > 0 ? "5px 12px" : "7px 14px",
            borderRadius: "20px",
            border: "1px dashed var(--pine, #2d5a43)",
            backgroundColor: selectedCompanions.length > 0 ? "transparent" : "color-mix(in srgb, var(--pine, #2d5a43) 6%, transparent)",
            color: "var(--pine, #2d5a43)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--pine, #2d5a43) 14%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = selectedCompanions.length > 0 ? "transparent" : "color-mix(in srgb, var(--pine, #2d5a43) 6%, transparent)";
          }}
        >
          <UserPlus size={14} />
          <span>
            {selectedCompanions.length > 0
              ? selectedCompanions.length === 1
                ? "+ Modificar compañero"
                : "+ Modificar compañeros"
              : pillButtonText}
          </span>
        </button>
      </div>

      {/* Modal / Popup rendered via Portal into document.body to avoid stacking context & overflow issues */}
      {isModalOpen && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="companion-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 100060,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            overscrollBehavior: "contain",
          }}
          onClick={handleCloseModal}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="companion-modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--card-bg, #ffffff)",
              color: "var(--ink, #1f2937)",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "440px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
              overflow: "hidden",
              position: "relative",
              border: "1px solid var(--border, #e5e7eb)",
              animation: "fadeScale 0.2s ease",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px 14px",
                borderBottom: "1px solid var(--border, #e5e7eb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--card-bg, #ffffff)",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "17px",
                    fontWeight: 700,
                    fontFamily: "var(--font-heading, serif)",
                    color: "var(--ink, #1f2937)",
                  }}
                >
                  {modalTitle}
                </h3>
                <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--muted, #6b7280)" }}>
                  {tempSelected.length === 0
                    ? "Ningún compañero seleccionado (máx. 29)"
                    : `${tempSelected.length} compañero${tempSelected.length !== 1 ? "s" : ""} seleccionado${tempSelected.length !== 1 ? "s" : ""} · ${tempSelected.length + 1} / 30 en total`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px",
                  color: "var(--muted, #6b7280)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input inside Modal */}
            <div style={{ padding: "14px 20px 8px", backgroundColor: "var(--card-bg, #ffffff)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1px solid var(--border, #d1d5db)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  backgroundColor: "var(--sand, #f8f7f4)",
                }}
              >
                <Search size={15} style={{ color: "var(--muted, #6b7280)", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Buscar amigo por @usuario..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    border: "none",
                    outline: "none",
                    width: "100%",
                    fontSize: "13px",
                    background: "transparent",
                    color: "var(--ink, #1f2937)",
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    title="Borrar búsqueda"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "var(--muted, #6b7280)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* List of Mutual Followers */}
            <div
              style={{
                padding: "6px 20px 14px",
                overflowY: "auto",
                flex: 1,
                maxHeight: "340px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                backgroundColor: "var(--card-bg, #ffffff)",
              }}
            >
              {loading ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "var(--muted, #6b7280)", fontSize: "13px" }}>
                  Cargando amigos mutuos...
                </div>
              ) : mutualFollowers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted, #6b7280)" }}>
                  <Users size={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 600, fontSize: "13px" }}>Sin seguidores mutuos todavía</p>
                  <p style={{ margin: "6px 0 0", fontSize: "11px", lineHeight: "1.4" }}>
                    Solo puedes añadir a personas a las que sigues y que te siguen a ti.
                  </p>
                </div>
              ) : filteredFollowers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted, #6b7280)", fontSize: "13px" }}>
                  No se encontró ningún seguidor mutuo con &ldquo;{search}&rdquo;.
                </div>
              ) : (
                filteredFollowers.map((follower) => {
                  const isChecked = tempSelectedIds.has(follower.id);
                  const isLimitReached = !isChecked && tempSelected.length >= 29;

                  return (
                    <div
                      key={follower.id}
                      onClick={() => !isLimitReached && handleToggleCompanion(follower)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        cursor: isLimitReached ? "not-allowed" : "pointer",
                        opacity: isLimitReached ? 0.45 : 1,
                        backgroundColor: isChecked ? "color-mix(in srgb, var(--pine, #2d5a43) 12%, transparent)" : "transparent",
                        border: isChecked
                          ? "1px solid color-mix(in srgb, var(--pine, #2d5a43) 30%, transparent)"
                          : "1px solid transparent",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked && !isLimitReached) {
                          e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.04)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isChecked) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      {/* Checkbox square */}
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          border: isChecked ? "none" : "1.5px solid var(--border, #d1d5db)",
                          backgroundColor: isChecked ? "var(--pine, #2d5a43)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {isChecked && <Check size={14} strokeWidth={2.5} />}
                      </div>

                      {/* Avatar */}
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          backgroundColor: "var(--pine, #2d5a43)",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        {follower.avatar_url ? (
                          <img
                            src={follower.avatar_url}
                            alt={follower.username}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          follower.username.charAt(0).toUpperCase()
                        )}
                      </div>

                      {/* Username */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink, #1f2937)" }}>
                          @{follower.username}
                        </div>
                        {follower.is_public === false && (
                          <div style={{ fontSize: "11px", color: "var(--muted, #6b7280)" }}>
                            Perfil privado
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--border, #e5e7eb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                backgroundColor: "var(--sand, #f8f7f4)",
              }}
            >
              <button
                type="button"
                onClick={handleCloseModal}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid var(--border, #d1d5db)",
                  background: "#fff",
                  color: "var(--muted, #6b7280)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--pine, #2d5a43)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Guardar ({tempSelected.length})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
