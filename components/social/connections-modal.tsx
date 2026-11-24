"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { useScrollLock } from "@/lib/scroll-lock";
import type { ConnectionStatus, SocialProfile } from "@/lib/social-cache";

interface ConnectionsModalProps {
  modalMode: "followers" | "following" | null;
  session: Session | null;
  currentMode: "countries" | "peaks";
  acceptedFollowers: SocialProfile[];
  pendingFollowers: SocialProfile[];
  following: SocialProfile[];
  connections: Record<string, ConnectionStatus>;
  followerStatuses: Record<string, ConnectionStatus>;
  onChangeTab: (tab: "followers" | "following") => void;
  onClose: () => void;
  onAcceptRequest: (profileId: string) => void;
  onRejectRequest: (profileId: string) => void;
  onRemoveFollower: (profileId: string, username: string) => void;
  onUnfollow: (profileId: string, username: string) => void;
  onConnect: (profileId: string, isPublic: boolean) => void;
}

export function ConnectionsModal({
  modalMode,
  session,
  currentMode,
  acceptedFollowers,
  pendingFollowers,
  following,
  connections,
  followerStatuses,
  onChangeTab,
  onClose,
  onAcceptRequest,
  onRejectRequest,
  onRemoveFollower,
  onUnfollow,
  onConnect,
}: ConnectionsModalProps) {
  useScrollLock(Boolean(modalMode));

  useEffect(() => {
    if (!modalMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalMode, onClose]);

  if (!modalMode) return null;

  const renderProfileItem = (profile: SocialProfile, context: "followers" | "following") => {
    const isMe = session?.user.id === profile.id;
    const followingStatus = connections[profile.id];
    const followerStatus = followerStatuses[profile.id];

    return (
      <div
        key={profile.id}
        className="connections-modal-item"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--cream, #faf8f5)",
          borderRadius: "12px",
          border: "1px solid var(--line)",
        }}
      >
        <Link
          href={`/perfil/${profile.username}?challenge=${currentMode}&from=social`}
          onClick={onClose}
          style={{
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            className="connections-item-avatar"
            style={{
              width: 38,
              height: 38,
              minWidth: 38,
              borderRadius: "50%",
              background: "var(--pine)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "15px",
              color: "white",
              overflow: "hidden",
            }}
          >
            {profile.avatar_url ? (
              <img
                src={getPhotoDisplayUrl(profile.avatar_url)}
                alt={profile.username}
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              profile.username.charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "14px",
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              @{profile.username}
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>
              {profile.is_public ? "Público" : "Privado"}
            </div>
          </div>
        </Link>

        {!isMe && session && (
          <div style={{ display: "flex", gap: "6px", flexShrink: 0, marginLeft: "8px" }}>
            {context === "followers" ? (
              followerStatus === "pending" ? (
                <>
                  <button
                    type="button"
                    className="button button--green"
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      borderRadius: "16px",
                      minHeight: "auto",
                      height: "auto",
                    }}
                    onClick={() => onAcceptRequest(profile.id)}
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className="button button--outline"
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      borderRadius: "16px",
                      minHeight: "auto",
                      height: "auto",
                    }}
                    onClick={() => onRejectRequest(profile.id)}
                  >
                    Rechazar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--outline"
                  style={{
                    padding: "4px 10px",
                    fontSize: "12px",
                    borderRadius: "16px",
                    minHeight: "auto",
                    height: "auto",
                  }}
                  onClick={() => onRemoveFollower(profile.id, profile.username)}
                >
                  Eliminar
                </button>
              )
            ) : followingStatus === "accepted" ? (
              <button
                type="button"
                className="button button--outline"
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  borderRadius: "16px",
                  minHeight: "auto",
                  height: "auto",
                }}
                onClick={() => onUnfollow(profile.id, profile.username)}
              >
                Siguiendo
              </button>
            ) : followingStatus === "pending" ? (
              <button
                type="button"
                className="button button--outline"
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  borderRadius: "16px",
                  minHeight: "auto",
                  height: "auto",
                }}
                onClick={() => onUnfollow(profile.id, profile.username)}
              >
                Pendiente
              </button>
            ) : (
              <button
                type="button"
                className="button button--purple"
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  borderRadius: "16px",
                  minHeight: "auto",
                  height: "auto",
                }}
                onClick={() => onConnect(profile.id, profile.is_public)}
              >
                Conectar
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="lightbox-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={onClose}
    >
      <div
        className="connections-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Conexiones"
        style={{
          background: "white",
          borderRadius: "16px",
          maxWidth: "460px",
          width: "100%",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="connections-modal-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={modalMode === "followers"}
              className={`connections-modal-tab ${modalMode === "followers" ? "active" : ""}`}
              style={{
                border: "none",
                background: modalMode === "followers" ? "var(--pine)" : "rgba(0,0,0,0.05)",
                color: modalMode === "followers" ? "white" : "var(--ink)",
                borderRadius: "20px",
                padding: "6px 14px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onClick={() => onChangeTab("followers")}
            >
              Seguidores ({acceptedFollowers.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modalMode === "following"}
              className={`connections-modal-tab ${modalMode === "following" ? "active" : ""}`}
              style={{
                border: "none",
                background: modalMode === "following" ? "var(--pine)" : "rgba(0,0,0,0.05)",
                color: modalMode === "following" ? "white" : "var(--ink)",
                borderRadius: "20px",
                padding: "6px 14px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onClick={() => onChangeTab("following")}
            >
              Siguiendo ({following.length})
            </button>
          </div>
          <button
            type="button"
            className="connections-modal-close"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "var(--muted)",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "16px 18px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {modalMode === "followers" ? (
            <>
              {pendingFollowers.length > 0 && (
                <div className="connections-pending-block" style={{ marginBottom: "14px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      color: "#e53e3e",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#e53e3e",
                        display: "inline-block",
                      }}
                    />
                    Solicitudes pendientes ({pendingFollowers.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {pendingFollowers.map((p) => renderProfileItem(p, "followers"))}
                  </div>
                  <div
                    style={{
                      borderBottom: "1px solid var(--line)",
                      marginTop: "14px",
                      marginBottom: "10px",
                    }}
                  />
                </div>
              )}

              {acceptedFollowers.length > 0 && pendingFollowers.length > 0 && (
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    color: "var(--muted)",
                    marginBottom: "6px",
                  }}
                >
                  Seguidores ({acceptedFollowers.length})
                </div>
              )}

              {acceptedFollowers.length === 0 && pendingFollowers.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2.5rem 1rem",
                    color: "var(--muted)",
                    fontSize: "14px",
                  }}
                >
                  Aún no tienes seguidores.
                </div>
              ) : (
                acceptedFollowers.map((p) => renderProfileItem(p, "followers"))
              )}
            </>
          ) : following.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "2.5rem 1rem",
                color: "var(--muted)",
                fontSize: "14px",
              }}
            >
              No sigues a nadie todavía.
            </div>
          ) : (
            following.map((p) => renderProfileItem(p, "following"))
          )}
        </div>
      </div>
    </div>
  );
}
