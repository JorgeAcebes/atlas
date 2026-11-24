"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Share2 } from "lucide-react";
import { formatDateSafe, formatRecordDateRange } from "@/lib/date-utils";
import { sortPhotosByTime } from "@/lib/image-utils";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { countriesById, peaksById } from "@/lib/progress-utils";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import {
  buildRecordShareUrl,
  executeShare,
  sanitizeDateForShare,
  sanitizeTextForShare,
} from "@/lib/share-utils";
import { RecordLinkBadge } from "@/components/shared/record-link-badge";

const PhotoLightbox = dynamic(
  () => import("@/components/photo-lightbox").then((m) => m.PhotoLightbox),
  { ssr: false }
);

export interface FeedItemCardProps {
  item: any;
  index?: number;
  session?: Session | null;
  onAuthRequired?: () => void;
  isConnectedToPrev?: boolean;
  isConnectedToNext?: boolean;
  followingUserIdsSet?: ReadonlySet<string>;
}

function FeedItemCardInner({
  item,
  index,
  session,
  isConnectedToNext,
  followingUserIdsSet,
}: FeedItemCardProps) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const visibleCompanions = useMemo(() => {
    const comps: any[] = item.companions || [];
    return comps.filter((comp) => {
      if (comp.id === item.user_id) return false;
      if (comp.is_public !== false) return true;
      if (session?.user?.id === comp.id) return true;
      if (followingUserIdsSet && followingUserIdsSet.has(comp.id)) return true;
      return false;
    });
  }, [item.companions, item.user_id, session?.user?.id, followingUserIdsSet]);

  const photos: any[] = useMemo(
    () =>
      sortPhotosByTime(
        (item.photos || [])
          .filter((p: any) => p && (p.public_url || p.storage_path))
          .map((p: any) => ({
            ...p,
            public_url: getPhotoDisplayUrl(p.public_url, p.storage_path),
          }))
      ),
    [item.photos]
  );

  const hasPhotos = photos.length > 0;
  const isLightboxOpen = lightboxIndex !== null;

  const isEager = index !== undefined && index < 2;
  const imgLoading = isEager ? ("eager" as const) : ("lazy" as const);
  const imgPriority = isEager ? ("high" as const) : undefined;

  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
    if (typeof window !== "undefined" && window.location.hash !== "#lightbox") {
      window.history.pushState({ feedLightbox: true }, "", "#lightbox");
    }
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    if (typeof window !== "undefined" && window.location.hash === "#lightbox") {
      window.history.back();
    }
  };

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleCloseOnNavigation = () => {
      if (window.location.hash !== "#lightbox") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("popstate", handleCloseOnNavigation);
    window.addEventListener("hashchange", handleCloseOnNavigation);
    return () => {
      window.removeEventListener("popstate", handleCloseOnNavigation);
      window.removeEventListener("hashchange", handleCloseOnNavigation);
    };
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    lockScroll();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      unlockScroll();
    };
  }, [isLightboxOpen]);

  let isCountry = false;
  let isPeak = false;
  let finalLocationName = item.location_name || "Experiencia";

  if (item.type === "ascent") {
    const summitIdLower = (item.summit_id || "").toLowerCase();
    const country = countriesById.get(summitIdLower);
    const peak = peaksById.get(summitIdLower);
    if (country) {
      isCountry = true;
      finalLocationName = country.name;
    } else if (peak) {
      isPeak = true;
      finalLocationName = peak.name;
    } else {
      finalLocationName = (item.summit_id || "").toUpperCase();
    }
  } else if (item.type === "experience" && item.experience_title) {
    finalLocationName = item.sub_item_title
      ? `${item.experience_title} (${item.sub_item_title})`
      : item.experience_title;
  }

  let title = "ha completado una experiencia";
  if (item.type === "ascent") {
    title = isPeak ? "ha registrado una ascensión" : "ha visitado un país";
  }

  const displayTitle = finalLocationName;
  const dateRangeStr = formatRecordDateRange(item.achieved_on, item.end_date);
  const username = item.profiles?.username;

  let recordChallenge = "countries";
  let recordId = "";
  if (item.type === "ascent") {
    recordId = (item.summit_id || "").toLowerCase();
    recordChallenge = isPeak ? "peaks" : "countries";
  } else if (item.type === "experience") {
    recordChallenge = "experiences";
    if (item.experience_id) {
      recordId = item.sub_item_id
        ? `${item.experience_id}::${item.sub_item_id}`
        : item.experience_id;
    }
  }

  const profileBaseUrl = username
    ? `/perfil/${username}?challenge=${recordChallenge}&from=social`
    : "";
  const recordUrlWithHash =
    username && recordId
      ? `${profileBaseUrl}#panel=${encodeURIComponent(recordId)}`
      : profileBaseUrl;

  const handleTitleClick = (e: React.MouseEvent) => {
    if (!username || !recordId) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    try {
      sessionStorage.setItem("auto_open_panel", recordId);
    } catch {
      /* ignore */
    }
    router.push(profileBaseUrl);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl =
      username && recordId
        ? buildRecordShareUrl({
            baseUrl,
            username,
            challenge: recordChallenge,
            recordId,
            from: "social",
          })
        : `${baseUrl}/social`;

    const shareTitle = `${displayTitle} · ${username || "Atlas"}`;
    const safeDateRangeStr = sanitizeDateForShare(dateRangeStr);
    let shareText = `${username ? `@${username}` : "Usuario"} ${title}: ${displayTitle}`;
    if (safeDateRangeStr) shareText += ` (${safeDateRangeStr})`;
    const cleanNotes = sanitizeTextForShare(item.notes);
    if (cleanNotes) shareText += `\n"${cleanNotes}"`;
    shareText += `\n\n${shareUrl}`;

    await executeShare(
      {
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      },
      () => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
      }
    );
  };

  return (
    <div
      className={`feed-item-wrapper ${isConnectedToNext ? "feed-item-wrapper--connected-next" : ""}`}
      style={{ position: "relative", marginBottom: "24px" }}
    >
      {isConnectedToNext && (
        <div
          className="feed-thread-connector"
          title="Ruta compartida"
          style={{
            position: "absolute",
            bottom: "-25px",
            left: "35px",
            width: "3px",
            height: "26px",
            backgroundColor: "var(--pine, #2d5a43)",
            zIndex: 5,
            borderRadius: "2px",
          }}
        />
      )}

      <div className="feed-card" style={{ marginBottom: 0 }}>
        <div className="feed-card-header">
          <Link
            href={`/perfil/${item.profiles?.username}?challenge=${recordChallenge}&from=social`}
            style={{ textDecoration: "none" }}
          >
            <div
              className="feed-card-avatar"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--pine)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                color: "white",
              }}
            >
              {item.profiles?.avatar_url ? (
                <img
                  src={getPhotoDisplayUrl(item.profiles.avatar_url)}
                  alt={item.profiles.username}
                  loading={imgLoading}
                  decoding="async"
                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                item.profiles?.username?.charAt(0).toUpperCase()
              )}
            </div>
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", lineHeight: "1.2" }}>
              <Link
                href={`/perfil/${item.profiles?.username}?challenge=${recordChallenge}&from=social`}
                style={{ fontWeight: "bold", textDecoration: "none", color: "var(--ink)" }}
              >
                {item.profiles?.username}
              </Link>{" "}
              <span style={{ color: "var(--muted)" }}>{title}</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", fontWeight: "500" }}>
              {dateRangeStr || formatDateSafe(item.created_at)}
            </div>
          </div>

          <button
            type="button"
            className="feed-share-btn"
            onClick={handleShare}
            title={copied ? "Enlace copiado al portapapeles" : "Compartir publicación"}
            aria-label="Compartir publicación"
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: copied ? "var(--pine)" : "var(--muted)",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            {copied ? (
              <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--pine)" }}>
                ¡Copiado!
              </span>
            ) : (
              <Share2 size={16} />
            )}
          </button>
        </div>

        <div className="feed-card-body" style={{ paddingBottom: hasPhotos ? "12px" : "16px", paddingTop: "0" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>
            {username && recordId ? (
              <Link
                href={recordUrlWithHash}
                onClick={handleTitleClick}
                className="feed-record-title"
                style={{
                  color: "var(--pine)",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                {displayTitle}
              </Link>
            ) : (
              <span style={{ color: "var(--pine)" }}>{displayTitle}</span>
            )}
          </h3>

          {item.notes && (
            <p
              className="feed-item-notes user-written-text"
              style={{ margin: 0, fontSize: "14px", color: "var(--ink)", lineHeight: "1.5" }}
            >
              {item.notes}
            </p>
          )}

          {(item.link || item.link_2) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: Boolean(item.notes) ? 4 : 8,
              }}
            >
              <RecordLinkBadge link={item.link} linkName={item.link_name} />
              <RecordLinkBadge link={item.link_2} linkName={item.link_name_2} />
            </div>
          )}

          {visibleCompanions.length > 0 && (
            <div
              className="feed-card-companions"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginTop: item.notes || item.link || item.link_2 ? "10px" : "6px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--muted, #6b7280)", fontWeight: 600 }}>
                {visibleCompanions.length === 1
                  ? isPeak
                    ? "Compañero de ruta:"
                    : isCountry
                    ? "Compañero de viaje:"
                    : "Compañero de experiencia:"
                  : isPeak
                  ? "Compañeros de ruta:"
                  : isCountry
                  ? "Compañeros de viaje:"
                  : "Compañeros de experiencia:"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                {visibleCompanions.map((comp) => (
                  <Link
                    key={comp.id}
                    href={`/perfil/${comp.username}`}
                    title={`@${comp.username}`}
                    style={{ textDecoration: "none" }}
                  >
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: "var(--pine, #2d5a43)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        fontSize: "11px",
                        overflow: "hidden",
                        border: "1.5px solid var(--card-bg, #fff)",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                      }}
                    >
                      {comp.avatar_url ? (
                        <img
                          src={getPhotoDisplayUrl(comp.avatar_url)}
                          alt={comp.username}
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        comp.username.charAt(0).toUpperCase()
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {photos.length > 0 && (
          <div
            style={{
              position: "relative",
              width: "100%",
              marginBottom: 0,
              backgroundColor: "rgba(92, 155, 125, 0.08)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {photos.length === 1 ? (
              <img
                src={photos[0].public_url}
                onClick={() => openLightbox(0)}
                alt="Activity media"
                className="feed-card-media"
                loading={imgLoading}
                decoding="async"
                {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                style={{ width: "100%", height: "300px", objectFit: "cover", cursor: "pointer", display: "block" }}
              />
            ) : photos.length === 3 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gridTemplateRows: "1fr 1fr",
                  gap: "4px",
                  overflow: "hidden",
                  height: "300px",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    gridRow: "1 / span 2",
                    gridColumn: "1",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    backgroundColor: "rgba(92, 155, 125, 0.05)",
                  }}
                >
                  <img
                    src={photos[0].public_url}
                    onClick={() => openLightbox(0)}
                    alt=""
                    loading={imgLoading}
                    decoding="async"
                    {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" }}
                  />
                </div>
                <div
                  style={{
                    gridRow: "1",
                    gridColumn: "2",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    backgroundColor: "rgba(92, 155, 125, 0.05)",
                  }}
                >
                  <img
                    src={photos[1].public_url}
                    onClick={() => openLightbox(1)}
                    alt=""
                    loading={imgLoading}
                    decoding="async"
                    {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" }}
                  />
                </div>
                <div
                  style={{
                    gridRow: "2",
                    gridColumn: "2",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    backgroundColor: "rgba(92, 155, 125, 0.05)",
                  }}
                >
                  <img
                    src={photos[2].public_url}
                    onClick={() => openLightbox(2)}
                    alt=""
                    loading={imgLoading}
                    decoding="async"
                    {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", overflow: "hidden", width: "100%" }}>
                {photos.slice(0, 4).map((photo: any, pIndex: number) => {
                  const isLast = pIndex === 3;
                  const hasMore = photos.length > 4;
                  return (
                    <div
                      key={photo.id || pIndex}
                      style={{
                        position: "relative",
                        aspectRatio: "1",
                        width: "100%",
                        minHeight: 0,
                        minWidth: 0,
                        overflow: "hidden",
                        backgroundColor: "rgba(92, 155, 125, 0.05)",
                      }}
                    >
                      <img
                        src={photo.public_url}
                        onClick={() => openLightbox(pIndex)}
                        alt=""
                        loading={imgLoading}
                        decoding="async"
                        {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" }}
                      />
                      {isLast && hasMore && (
                        <div
                          onClick={() => openLightbox(pIndex)}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: "rgba(0,0,0,0.5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontSize: "24px",
                            fontWeight: "bold",
                            cursor: "pointer",
                          }}
                        >
                          +{photos.length - 4}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {isLightboxOpen && lightboxIndex !== null && photos[lightboxIndex] && (
        <PhotoLightbox
          photos={photos}
          currentIndex={lightboxIndex}
          onIndexChange={(idx) => setLightboxIndex(idx)}
          onClose={closeLightbox}
          title={finalLocationName}
        />
      )}
    </div>
  );
}

export const FeedItemCard = React.memo(FeedItemCardInner);
