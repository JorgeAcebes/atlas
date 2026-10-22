import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth-context";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { notifyPendingChanged } from "./use-pending-requests";
import {
  RecordCompanion,
  acceptTripInvitation,
  rejectTripInvitation,
} from "@/lib/companions";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { X, Check, Inbox, Users, AlertCircle } from "lucide-react";

export interface FollowRequest {
  id: string;
  follower_id: string;
  following_id: string;
  status: string;
  created_at: string;
  follower_profile?: {
    id: string;
    username: string;
    avatar_url?: string | null;
    is_public?: boolean;
  } | null;
}

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvitationAccepted?: () => void;
  onInvitationRejected?: () => void;
  onFollowAccepted?: (followerId: string) => void;
  onFollowRejected?: (followerId: string) => void;
  onPendingChanged?: () => void;
}

export function InboxModal({
  isOpen,
  onClose,
  onInvitationAccepted,
  onInvitationRejected,
  onFollowAccepted,
  onFollowRejected,
  onPendingChanged,
}: InboxModalProps) {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<"requests" | "shared">("requests");
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [tripInvitations, setTripInvitations] = useState<RecordCompanion[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchInboxData = useCallback(
    async (silent = false) => {
      if (!supabase || !session) return;
      if (!silent) setLoading(true);

      const userId = session.user.id;
      try {
        const [connsRes, compsRes] = await Promise.all([
          supabase
            .from("connections")
            .select("id, follower_id, following_id, status, created_at")
            .eq("following_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
          supabase
            .from("record_companions")
            .select(`
              *,
              inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
            `)
            .eq("companion_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
        ]);

        let enrichedRequests: FollowRequest[] = [];
        if (connsRes.data && connsRes.data.length > 0) {
          const followerIds = connsRes.data.map((c) => c.follower_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, avatar_url, is_public")
            .in("id", followerIds);

          const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
          enrichedRequests = connsRes.data.map((c) => ({
            ...c,
            follower_profile: profileMap.get(c.follower_id) || null,
          }));
        }

        const enrichedTrips = (compsRes.data as RecordCompanion[]) || [];

        setFollowRequests(enrichedRequests);
        setTripInvitations(enrichedTrips);
        setHasLoadedOnce(true);

        // If there are no follow requests but there ARE trip invitations, auto-switch to shared
        if (!silent && enrichedRequests.length === 0 && enrichedTrips.length > 0) {
          setActiveTab("shared");
        }
      } catch (err) {
        console.warn("Error fetching inbox data:", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (isOpen) {
      lockScroll();
      fetchInboxData();
    } else {
      unlockScroll();
      setNotice(null);
    }
    return () => {
      unlockScroll();
    };
  }, [isOpen, fetchInboxData]);

  // Escape key closes inbox modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  // Handle follow requests
  const handleAcceptFollow = async (req: FollowRequest) => {
    if (!session || !supabase) return;
    setActionLoadingId(req.id);
    setNotice(null);

    // Optimistic UI update
    setFollowRequests((prev) => prev.filter((r) => r.id !== req.id));

    try {
      const { error } = await supabase
        .from("connections")
        .update({ status: "accepted" })
        .eq("id", req.id);

      if (error) {
        // Rollback
        setFollowRequests((prev) => [req, ...prev]);
        setNotice("No se pudo aceptar la solicitud.");
      } else {
        const username = req.follower_profile?.username || "Usuario";
        setNotice(`Has aceptado la solicitud de @${username}.`);
        notifyPendingChanged();
        onFollowAccepted?.(req.follower_id);
        onPendingChanged?.();
        setTimeout(() => setNotice(null), 3000);
      }
    } catch {
      setFollowRequests((prev) => [req, ...prev]);
      setNotice("Error al procesar la solicitud.");
    } finally {
      setActionLoadingId(null);
      fetchInboxData(true);
    }
  };

  const handleRejectFollow = async (req: FollowRequest) => {
    if (!session || !supabase) return;
    setActionLoadingId(req.id);
    setNotice(null);

    // Optimistic UI update
    setFollowRequests((prev) => prev.filter((r) => r.id !== req.id));

    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", req.id);

      if (error) {
        setFollowRequests((prev) => [req, ...prev]);
        setNotice("No se pudo rechazar la solicitud.");
      } else {
        setNotice("Solicitud rechazada.");
        notifyPendingChanged();
        onFollowRejected?.(req.follower_id);
        onPendingChanged?.();
        setTimeout(() => setNotice(null), 2500);
      }
    } catch {
      setFollowRequests((prev) => [req, ...prev]);
      setNotice("Error al procesar la solicitud.");
    } finally {
      setActionLoadingId(null);
      fetchInboxData(true);
    }
  };

  // Handle trip / record companions
  const handleAcceptTrip = async (inv: RecordCompanion) => {
    if (!session) return;
    setActionLoadingId(inv.id);
    setNotice(null);

    // Optimistic UI update
    setTripInvitations((prev) => prev.filter((i) => i.id !== inv.id));

    const res = await acceptTripInvitation(inv, session.user.id);
    setActionLoadingId(null);

    if (res.success) {
      setNotice(
        res.wasConvertedFromUnknown
          ? "¡Fecha actualizada y actividad completada con éxito!"
          : "¡Actividad añadida a tu mapa y completada con éxito!"
      );
      notifyPendingChanged();
      onInvitationAccepted?.();
      onPendingChanged?.();
      setTimeout(() => setNotice(null), 3500);
    } else {
      setTripInvitations((prev) => [inv, ...prev]);
      setNotice(res.error || "No se pudo aceptar la invitación.");
    }
    fetchInboxData(true);
  };

  const handleRejectTrip = async (inv: RecordCompanion) => {
    if (!session) return;
    setActionLoadingId(inv.id);
    setNotice(null);

    // Optimistic UI update
    setTripInvitations((prev) => prev.filter((i) => i.id !== inv.id));

    const res = await rejectTripInvitation(inv.id, session.user.id);
    setActionLoadingId(null);

    if (res.success) {
      setNotice("Invitación rechazada.");
      notifyPendingChanged();
      onInvitationRejected?.();
      onPendingChanged?.();
      setTimeout(() => setNotice(null), 2500);
    } else {
      setTripInvitations((prev) => [inv, ...prev]);
      setNotice(res.error || "No se pudo rechazar la invitación.");
    }
    fetchInboxData(true);
  };

  function getActivityDetails(inv: RecordCompanion) {
    if (inv.item_type === "peaks") {
      const peak = peaks.find((p) => p.id === inv.item_id);
      return {
        title: peak?.name || inv.item_id,
        subtitle: peak ? `${peak.province} · ${peak.altitude}m` : "Cumbre provincial",
        typeLabel: "Compañero de ruta",
      };
    } else if (inv.item_type === "countries") {
      const country = countries.find((c) => c.id === inv.item_id || `country-${c.id}` === inv.item_id);
      return {
        title: country ? country.name : inv.item_id,
        subtitle: country ? `${country.continent} · ${country.capital}` : "País del mundo",
        typeLabel: "Compañero de viaje",
      };
    } else {
      let title = inv.location_name || "Experiencia";
      let subtitle = "Experiencia";
      for (const cat of predefinedCategories) {
        const found = cat.experiences.find((e) => e.id === inv.item_id);
        if (found) {
          title = found.name;
          if (inv.sub_item_id && found.subItems) {
            const sub = found.subItems.find((s) => s.id === inv.sub_item_id);
            if (sub) subtitle = sub.name;
          }
          break;
        }
      }
      return {
        title,
        subtitle,
        typeLabel: "Compañero de experiencia",
      };
    }
  }

  function formatDateRange(startDateStr: string, endDateStr?: string | null) {
    try {
      const d1 = new Date(startDateStr);
      const s1 = format(d1, "d MMM yyyy", { locale: es });
      if (endDateStr && endDateStr !== startDateStr) {
        const d2 = new Date(endDateStr);
        const s2 = format(d2, "d MMM yyyy", { locale: es });
        return `${s1} - ${s2}`;
      }
      return s1;
    } catch {
      return startDateStr;
    }
  }

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="inbox-modal-overlay"
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
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="inbox-modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--card-bg, #fff)",
          color: "var(--ink, #1f2937)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "520px",
          minHeight: "440px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
          position: "relative",
          border: "1px solid var(--border, #e5e7eb)",
          animation: "fadeScale 0.2s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border, #e5e7eb)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor: "rgba(92, 155, 125, 0.12)",
                color: "var(--pine, #2d5a43)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Inbox size={20} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                  fontFamily: "var(--font-heading, serif)",
                  lineHeight: 1.2,
                }}
              >
                Bandeja de entrada
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted, #6b7280)" }}>
                Solicitudes de seguimiento y viajes compartidos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar bandeja de entrada"
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
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Notice alert */}
        {notice && (
          <div
            style={{
              padding: "10px 16px",
              backgroundColor: "rgba(92, 155, 125, 0.12)",
              color: "var(--pine, #2d5a43)",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderBottom: "1px solid var(--border, #e5e7eb)",
            }}
          >
            <AlertCircle size={16} />
            <span style={{ flex: 1 }}>{notice}</span>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border, #e5e7eb)",
            backgroundColor: "rgba(0, 0, 0, 0.02)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "requests" ? 700 : 500,
              color: activeTab === "requests" ? "var(--pine, #2d5a43)" : "var(--muted, #6b7280)",
              borderBottom: activeTab === "requests" ? "2px solid var(--pine, #2d5a43)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>Solicitudes</span>
            {followRequests.length > 0 && (
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: "#ef4444",
                  display: "inline-block",
                }}
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shared")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "shared" ? 700 : 500,
              color: activeTab === "shared" ? "var(--pine, #2d5a43)" : "var(--muted, #6b7280)",
              borderBottom: activeTab === "shared" ? "2px solid var(--pine, #2d5a43)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>Registros compartidos</span>
            {tripInvitations.length > 0 && (
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: "#ef4444",
                  display: "inline-block",
                }}
              />
            )}
          </button>
        </div>

        {/* Content list */}
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            flex: 1,
            minHeight: "300px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {loading && !hasLoadedOnce ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted, #6b7280)", fontSize: "14px" }}>
              Cargando solicitudes...
            </div>
          ) : activeTab === "requests" ? (
            followRequests.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "48px 16px",
                  color: "var(--muted, #6b7280)",
                }}
              >
                <Users size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>No tienes solicitudes de seguimiento</p>
                <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                  Cuando alguien te envíe una solicitud de seguimiento, aparecerá aquí.
                </p>
              </div>
            ) : (
              followRequests.map((req) => {
                const follower = req.follower_profile;
                const isProcessing = actionLoadingId === req.id;

                return (
                  <div
                    key={req.id}
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      backgroundColor: "rgba(0, 0, 0, 0.01)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          backgroundColor: "var(--pine, #2d5a43)",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "15px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        {follower?.avatar_url ? (
                          <img
                            src={follower.avatar_url}
                            alt={follower.username}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          follower?.username?.charAt(0).toUpperCase() || "?"
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            color: "var(--ink, #1f2937)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          @{follower?.username || "Usuario"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted, #6b7280)", marginTop: "1px" }}>
                          quiere seguirte
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleRejectFollow(req)}
                        disabled={isProcessing}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "6px",
                          border: "1px solid var(--border, #d1d5db)",
                          background: "#fff",
                          color: "var(--muted, #6b7280)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: isProcessing ? "not-allowed" : "pointer",
                          opacity: isProcessing ? 0.6 : 1,
                        }}
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptFollow(req)}
                        disabled={isProcessing}
                        style={{
                          padding: "6px 16px",
                          borderRadius: "6px",
                          border: "none",
                          backgroundColor: "var(--pine, #2d5a43)",
                          color: "#fff",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: isProcessing ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          opacity: isProcessing ? 0.6 : 1,
                        }}
                      >
                        <Check size={14} />
                        <span>Aceptar</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : tripInvitations.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 16px",
                color: "var(--muted, #6b7280)",
              }}
            >
              <Users size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>No tienes registros compartidos pendientes</p>
              <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                Cuando un compañero de ruta o viaje te invite a compartir una actividad, aparecerá aquí.
              </p>
            </div>
          ) : (
            tripInvitations.map((inv) => {
              const details = getActivityDetails(inv);
              const inviter = inv.inviter_profile;
              const isProcessing = actionLoadingId === inv.id;

              return (
                <div
                  key={inv.id}
                  style={{
                    border: "1px solid var(--border, #e5e7eb)",
                    borderRadius: "10px",
                    padding: "14px",
                    backgroundColor: "rgba(0, 0, 0, 0.01)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        backgroundColor: "var(--pine, #2d5a43)",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {inviter?.avatar_url ? (
                        <img
                          src={inviter.avatar_url}
                          alt={inviter.username}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        inviter?.username?.charAt(0).toUpperCase() || "?"
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", lineHeight: 1.3 }}>
                        <strong>@{inviter?.username || "Usuario"}</strong> te invitó como{" "}
                        <span style={{ color: "var(--pine, #2d5a43)", fontWeight: 600 }}>{details.typeLabel}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--muted, #6b7280)", marginTop: "2px" }}>
                        Fecha: {formatDateRange(inv.start_date, inv.end_date)}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "rgba(92, 155, 125, 0.08)",
                      borderRadius: "6px",
                    }}
                  >
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--ink, #1f2937)" }}>
                      {details.title}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted, #6b7280)", marginTop: "2px" }}>
                      {details.subtitle}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "2px" }}>
                    <button
                      type="button"
                      onClick={() => handleRejectTrip(inv)}
                      disabled={isProcessing}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: "1px solid var(--border, #d1d5db)",
                        background: "#fff",
                        color: "var(--muted, #6b7280)",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: isProcessing ? "not-allowed" : "pointer",
                        opacity: isProcessing ? 0.6 : 1,
                      }}
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptTrip(inv)}
                      disabled={isProcessing}
                      style={{
                        padding: "6px 16px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "var(--pine, #2d5a43)",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: isProcessing ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        opacity: isProcessing ? 0.6 : 1,
                      }}
                    >
                      <Check size={14} />
                      <span>Aceptar</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
