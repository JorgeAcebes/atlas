import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth-context";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import {
  RecordCompanion,
  acceptTripInvitation,
  rejectTripInvitation,
  unlinkCompanion,
} from "@/lib/companions";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { X, Check, Inbox, Users, AlertCircle, Trash2 } from "lucide-react";

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvitationAccepted?: () => void;
}

export function InboxModal({ isOpen, onClose, onInvitationAccepted }: InboxModalProps) {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<"pending" | "accepted">("pending");
  const [invitations, setInvitations] = useState<RecordCompanion[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("record_companions")
        .select(`
          *,
          inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
        `)
        .eq("companion_id", session.user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setInvitations(data as RecordCompanion[]);
      }
    } catch (err) {
      console.warn("Error fetching invitations:", err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (isOpen) {
      lockScroll();
      fetchInvitations();
    } else {
      unlockScroll();
      setNotice(null);
    }
    return () => {
      unlockScroll();
    };
  }, [isOpen, fetchInvitations]);

  const handleAccept = async (inv: RecordCompanion) => {
    if (!session) return;
    setActionLoadingId(inv.id);
    setNotice(null);

    const res = await acceptTripInvitation(inv, session.user.id);
    setActionLoadingId(null);

    if (res.success) {
      setNotice("¡Actividad añadida a tu mapa y completada con éxito!");
      await fetchInvitations();
      onInvitationAccepted?.();
      setTimeout(() => setNotice(null), 3500);
    } else {
      setNotice(res.error || "No se pudo aceptar la invitación.");
    }
  };

  const handleReject = async (invId: string) => {
    if (!session) return;
    setActionLoadingId(invId);
    setNotice(null);

    const res = await rejectTripInvitation(invId, session.user.id);
    setActionLoadingId(null);

    if (res.success) {
      setNotice("Invitación rechazada.");
      await fetchInvitations();
      setTimeout(() => setNotice(null), 2500);
    } else {
      setNotice(res.error || "No se pudo rechazar la invitación.");
    }
  };

  const handleUnlink = async (invId: string) => {
    if (!session) return;
    setActionLoadingId(invId);
    setNotice(null);

    const res = await unlinkCompanion(invId, session.user.id);
    setActionLoadingId(null);

    if (res.success) {
      setNotice("Te has desvinculado de este viaje.");
      await fetchInvitations();
      onInvitationAccepted?.();
      setTimeout(() => setNotice(null), 2500);
    } else {
      setNotice(res.error || "No se pudo desvincular.");
    }
  };

  if (!isOpen) return null;

  const pendingList = invitations.filter((i) => i.status === "pending");
  const acceptedList = invitations.filter((i) => i.status === "accepted");

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

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="inbox-modal-card"
        style={{
          backgroundColor: "var(--card-bg, #fff)",
          color: "var(--ink, #1f2937)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
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
                Invitaciones de compañeros de ruta y viaje
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
            onClick={() => setActiveTab("pending")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "pending" ? 700 : 500,
              color: activeTab === "pending" ? "var(--pine, #2d5a43)" : "var(--muted, #6b7280)",
              borderBottom: activeTab === "pending" ? "2px solid var(--pine, #2d5a43)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span>Pendientes</span>
            {pendingList.length > 0 && (
              <span
                style={{
                  backgroundColor: "#e53e3e",
                  color: "#fff",
                  fontSize: "11px",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontWeight: 700,
                }}
              >
                {pendingList.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("accepted")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "accepted" ? 700 : 500,
              color: activeTab === "accepted" ? "var(--pine, #2d5a43)" : "var(--muted, #6b7280)",
              borderBottom: activeTab === "accepted" ? "2px solid var(--pine, #2d5a43)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span>Viajes compartidos ({acceptedList.length})</span>
          </button>
        </div>

        {/* Content list */}
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted, #6b7280)", fontSize: "14px" }}>
              Cargando invitaciones...
            </div>
          ) : activeTab === "pending" ? (
            pendingList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "36px 16px",
                  color: "var(--muted, #6b7280)",
                }}
              >
                <Users size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>No tienes invitaciones pendientes</p>
                <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                  Cuando alguien que os sigáis mutuamente te añada a una ruta o viaje, aparecerá aquí.
                </p>
              </div>
            ) : (
              pendingList.map((inv) => {
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

                    <div style={{ fontSize: "11px", color: "var(--muted, #6b7280)", fontStyle: "italic" }}>
                      * Al aceptar, se añadirá a tu mapa sin fotos ni notas personales.
                    </div>

                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "2px" }}>
                      <button
                        type="button"
                        onClick={() => handleReject(inv.id)}
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
                        onClick={() => handleAccept(inv)}
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
          ) : acceptedList.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "36px 16px",
                color: "var(--muted, #6b7280)",
              }}
            >
              <Users size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>No tienes viajes compartidos activos</p>
              <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                Las actividades que aceptes realizar con amigos aparecerán aquí.
              </p>
            </div>
          ) : (
            acceptedList.map((inv) => {
              const details = getActivityDetails(inv);
              const inviter = inv.inviter_profile;
              const isProcessing = actionLoadingId === inv.id;

              return (
                <div
                  key={inv.id}
                  style={{
                    border: "1px solid var(--border, #e5e7eb)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--ink, #1f2937)" }}>
                      {details.title}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted, #6b7280)", marginTop: "2px" }}>
                      Con @{inviter?.username || "amigo"} · {formatDateRange(inv.start_date, inv.end_date)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnlink(inv.id)}
                    disabled={isProcessing}
                    title="Desvincularme de este viaje compartido"
                    style={{
                      background: "none",
                      border: "1px solid #fed7d7",
                      color: "#e53e3e",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: isProcessing ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Desvincular</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
