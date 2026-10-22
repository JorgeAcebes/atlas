import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "./auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { Link as LinkIcon, Video, Camera, Briefcase, MapPin, Footprints, Share2 } from "lucide-react";
import { es } from "date-fns/locale";
import { countries } from "@/data/countries";
import { peaks } from "@/data/peaks";
import { predefinedCategories } from "@/data/experiences";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { sortPhotosByTime } from "@/lib/image-utils";
import { compareFeedRecords, areFeedItemsConnected } from "@/lib/feed-sort";
import { datesOverlap } from "@/lib/companions";
import { PhotoLightbox } from "./photo-lightbox";

function isUnknownDate(dateVal: string | undefined | null): boolean {
  if (!dateVal) return true;
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (trimmed.startsWith("1900-01-01") || trimmed.startsWith("1899-12-31")) return true;
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return true;
  return d.getFullYear() <= 1900;
}

function formatCustomDate(dateVal: string | undefined | null): string {
  if (!dateVal || isUnknownDate(dateVal)) return '';
  const trimmed = typeof dateVal === 'string' ? dateVal.split('T')[0] : '';
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day, 12, 0, 0);
    return format(d, "d MMM yyyy", { locale: es });
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return format(d, "d MMM yyyy", { locale: es });
}

function formatRecordDateRange(startDateVal: string | undefined | null, endDateVal: string | undefined | null): string {
  const startStr = formatCustomDate(startDateVal);
  if (!startStr) return '';
  if (endDateVal && !isUnknownDate(endDateVal) && endDateVal !== startDateVal) {
    const endStr = formatCustomDate(endDateVal);
    if (endStr && endStr !== startStr) {
      return `${startStr} - ${endStr}`;
    }
  }
  return startStr;
}

export { compareFeedRecords, areFeedItemsConnected };

function formatDateSafe(dateVal: string | undefined | null): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

function isVideoLink(link?: string | null, linkName?: string | null) {
  if (!link) return false;
  const urlStr = link.toLowerCase();
  const nameStr = (linkName || "").toLowerCase();
  return (
    urlStr.includes("youtube.com") ||
    urlStr.includes("youtu.be") ||
    urlStr.includes("vimeo.com") ||
    urlStr.includes("tiktok.com") ||
    nameStr.includes("vídeo") ||
    nameStr.includes("video")
  );
}

function renderFeedLink(link?: string | null, linkName?: string | null) {
  if (!link) return null;
  let Icon = LinkIcon;
  const urlStr = link.toLowerCase();
  if (urlStr.includes("youtube.com") || urlStr.includes("youtu.be"))
    Icon = Video;
  else if (urlStr.includes("instagram.com")) Icon = Camera;
  else if (urlStr.includes("linkedin.com")) Icon = Briefcase;
  else if (
    urlStr.includes("strava.com") ||
    urlStr.includes("strava.app.link") ||
    urlStr.includes("wikiloc.com") ||
    urlStr.includes("komoot.com") ||
    urlStr.includes("alltrails.com") ||
    urlStr.includes("garmin.com") ||
    urlStr.includes("outdooractive.com") ||
    urlStr.includes("relive.cc") ||
    urlStr.includes("fatmap.com") ||
    urlStr.includes("trailforks.com")
  )
    Icon = Footprints;
  else if (
    urlStr.includes("google.com/maps") ||
    urlStr.includes("maps.google.") ||
    urlStr.includes("maps.apple.com") ||
    urlStr.includes("openstreetmap.org")
  )
    Icon = MapPin;

  const displayName =
    linkName ||
    (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")
      ? "Vídeo en YouTube"
      : urlStr.includes("instagram.com")
        ? "Publicación en Instagram"
        : urlStr.includes("linkedin.com")
          ? "Publicación en LinkedIn"
          : urlStr.includes("google.com/maps") || urlStr.includes("maps.google.") || urlStr.includes("maps.apple.com") || urlStr.includes("openstreetmap.org")
            ? "Ver en mapa"
            : urlStr.includes("wikiloc.com")
              ? "Ruta en Wikiloc"
              : urlStr.includes("strava.com") || urlStr.includes("strava.app.link")
                ? "Actividad en Strava"
                : urlStr.includes("komoot.com")
                  ? "Ruta en Komoot"
                  : urlStr.includes("alltrails.com")
                    ? "Ruta en AllTrails"
                    : urlStr.includes("garmin.com")
                      ? "Actividad en Garmin"
                      : "Enlace adjunto");

  const href =
    link.startsWith("http://") || link.startsWith("https://")
      ? link
      : `https://${link}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="feed-link"
    >
      <Icon size={14} />
      <span style={{ textDecoration: "underline" }}>{displayName}</span>
    </a>
  );
}

function FeedItemCard({
  item,
  index,
  session: _session,
  onAuthRequired: _onAuthRequired,
  isConnectedToPrev,
  isConnectedToNext,
  followingUserIdsSet,
}: {
  item: any;
  index?: number;
  session?: Session | null;
  onAuthRequired?: () => void;
  isConnectedToPrev?: boolean;
  isConnectedToNext?: boolean;
  followingUserIdsSet?: Set<string>;
}) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const visibleCompanions = useMemo(() => {
    const comps: any[] = item.companions || [];
    return comps.filter((comp) => {
      if (comp.id === item.user_id) return false;
      if (comp.is_public !== false) return true;
      if (_session?.user?.id === comp.id) return true;
      if (followingUserIdsSet && followingUserIdsSet.has(comp.id)) return true;
      return false;
    });
  }, [item.companions, item.user_id, _session?.user?.id, followingUserIdsSet]);

  const photos: any[] = sortPhotosByTime((item.photos || []).filter((p: any) => p && p.public_url));
  const hasPhotos = photos.length > 0;
  const isLightboxOpen = lightboxIndex !== null;

  const isEager = index !== undefined && index < 2;
  const imgLoading = isEager ? ("eager" as const) : ("lazy" as const);
  const imgPriority = isEager ? ("high" as const) : undefined;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
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
    if (isLightboxOpen) {
      lockScroll();
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        unlockScroll();
      };
    }
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        setLightboxIndex(prev => (prev !== null && prev < photos.length - 1 ? prev + 1 : prev));
      } else if (e.key === "Escape") {
        closeLightbox();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, photos.length]);

  let isCountry = false;
  let isPeak = false;
  let finalLocationName = item.location_name || 'Experiencia';

  if (item.type === "ascent") {
    const summitIdLower = (item.summit_id || '').toLowerCase();
    const country = countries.find(c => c.id === summitIdLower);
    const peak = peaks.find(p => p.id === summitIdLower);
    if (country) {
      isCountry = true;
      finalLocationName = country.name;
    } else if (peak) {
      isPeak = true;
      finalLocationName = peak.name;
    } else {
      finalLocationName = (item.summit_id || '').toUpperCase();
    }
  } else if (item.type === "experience") {
    if (item.experience_title) {
      if (item.sub_item_title) {
        finalLocationName = `${item.experience_title} (${item.sub_item_title})`;
      } else {
        finalLocationName = item.experience_title;
      }
    }
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
    const summitIdLower = (item.summit_id || '').toLowerCase();
    recordId = summitIdLower;
    recordChallenge = isPeak ? "peaks" : "countries";
  } else if (item.type === "experience") {
    recordChallenge = "experiences";
    if (item.experience_id) {
      recordId = item.sub_item_id
        ? `${item.experience_id}::${item.sub_item_id}`
        : item.experience_id;
    }
  }

  const profileBaseUrl = username ? `/perfil/${username}?challenge=${recordChallenge}&from=social` : "";
  const recordUrlWithHash = username && recordId ? `${profileBaseUrl}#panel=${encodeURIComponent(recordId)}` : profileBaseUrl;

  const handleTitleClick = (e: React.MouseEvent) => {
    if (!username || !recordId) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    try {
      sessionStorage.setItem("auto_open_panel", recordId);
    } catch (err) {
      console.warn("Could not set sessionStorage:", err);
    }
    router.push(profileBaseUrl);
  };

  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = username && recordId ? `${baseUrl}${recordUrlWithHash}` : `${baseUrl}/social`;

    const shareTitle = `${displayTitle} · ${username || 'Atlas'}`;
    let shareText = `${username ? `@${username}` : 'Usuario'} ${title}: ${displayTitle}`;
    if (dateRangeStr) {
      shareText += ` (${dateRangeStr})`;
    }
    if (item.notes) {
      shareText += `\n"${item.notes}"`;
    }
    shareText += `\n\n${shareUrl}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const shareData: ShareData = {
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        };
        await navigator.share(shareData);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {}
        }
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {}
    }
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
        <Link href={`/perfil/${item.profiles?.username}?challenge=${recordChallenge}&from=social`} style={{ textDecoration: 'none' }}>
          <div className="feed-card-avatar" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--pine)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
            {item.profiles?.avatar_url ? (
              <img src={item.profiles.avatar_url} alt={item.profiles.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              item.profiles?.username?.charAt(0).toUpperCase()
            )}
          </div>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', lineHeight: '1.2' }}>
            <Link href={`/perfil/${item.profiles?.username}?challenge=${recordChallenge}&from=social`} style={{ fontWeight: 'bold', textDecoration: 'none', color: 'var(--ink)' }}>
              {item.profiles?.username}
            </Link>{' '}
            <span style={{ color: 'var(--muted)' }}>{title}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontWeight: '500' }}>
            {dateRangeStr || formatDateSafe(item.created_at)}
          </div>
        </div>
        <button
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
            <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--pine)" }}>¡Copiado!</span>
          ) : (
            <Share2 size={16} />
          )}
        </button>
      </div>

      <div className="feed-card-body" style={{ paddingBottom: hasPhotos ? '12px' : '16px', paddingTop: '0' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>
          {username && recordId ? (
            <Link
              href={recordUrlWithHash}
              onClick={handleTitleClick}
              className="feed-record-title"
              style={{
                color: 'var(--pine)',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {displayTitle}
            </Link>
          ) : (
            <span style={{ color: 'var(--pine)' }}>{displayTitle}</span>
          )}
        </h3>
        {item.notes && (
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink)', lineHeight: '1.5' }}>
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
            {renderFeedLink(item.link, item.link_name)}
            {renderFeedLink(item.link_2, item.link_name_2)}
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
                        src={comp.avatar_url}
                        alt={comp.username}
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
        <div style={{ position: 'relative', width: '100%', marginBottom: 0, backgroundColor: 'rgba(92, 155, 125, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
          {photos.length === 1 ? (
            <img 
              src={photos[0].public_url} 
              onClick={() => openLightbox(0)} 
              alt="Activity media" 
              className="feed-card-media" 
              loading={imgLoading}
              decoding="async"
              {...(imgPriority ? { fetchPriority: imgPriority } : {})}
              style={{ width: '100%', height: '300px', objectFit: 'cover', cursor: 'pointer', display: 'block' }} 
            />
          ) : photos.length === 3 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '4px', overflow: 'hidden', height: '300px', width: '100%' }}>
              <div style={{ gridRow: '1 / span 2', gridColumn: '1', position: 'relative', width: '100%', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: 'rgba(92, 155, 125, 0.05)' }}>
                <img 
                  src={photos[0].public_url} 
                  onClick={() => openLightbox(0)} 
                  alt="" 
                  loading={imgLoading}
                  decoding="async"
                  {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} 
                />
              </div>
              <div style={{ gridRow: '1', gridColumn: '2', position: 'relative', width: '100%', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: 'rgba(92, 155, 125, 0.05)' }}>
                <img 
                  src={photos[1].public_url} 
                  onClick={() => openLightbox(1)} 
                  alt="" 
                  loading={imgLoading}
                  decoding="async"
                  {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} 
                />
              </div>
              <div style={{ gridRow: '2', gridColumn: '2', position: 'relative', width: '100%', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: 'rgba(92, 155, 125, 0.05)' }}>
                <img 
                  src={photos[2].public_url} 
                  onClick={() => openLightbox(2)} 
                  alt="" 
                  loading={imgLoading}
                  decoding="async"
                  {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} 
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', overflow: 'hidden', width: '100%' }}>
              {photos.slice(0, 4).map((photo: any, pIndex: number) => {
                const isLast = pIndex === 3;
                const hasMore = photos.length > 4;
                return (
                  <div key={photo.id || pIndex} style={{ position: 'relative', aspectRatio: '1', width: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: 'rgba(92, 155, 125, 0.05)' }}>
                    <img 
                      src={photo.public_url} 
                      onClick={() => openLightbox(pIndex)} 
                      alt="" 
                      loading={imgLoading}
                      decoding="async"
                      {...(imgPriority ? { fetchPriority: imgPriority } : {})}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} 
                    />
                    {isLast && hasMore && (
                      <div 
                        onClick={() => openLightbox(pIndex)} 
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer' }}
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

      {/* Lightbox Modal con soporte de zoom, galería sin sobreposición de títulos y fondo negro */}
      {isLightboxOpen && photos[lightboxIndex] && (
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

function getStoredFeedItems(): any[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("app_cached_feed_items");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

let globalCachedFeedItems: any[] | null = null;
let globalFeedLastFetched = 0;
let isFetchingFeed = false;
const FEED_CACHE_TTL = 60 * 1000;

export function FeedTab({
  session,
  isActive = true,
  onAuthRequired,
  mode = "countries",
  experiencesMode = false,
  searchQuery = "",
  onClearSearch,
  followingOnly = false,
  followingUserIds = [],
  onDisableFollowingOnly,
}: {
  session: Session | null;
  isActive?: boolean;
  onAuthRequired?: () => void;
  mode?: "countries" | "peaks";
  experiencesMode?: boolean;
  searchQuery?: string;
  onClearSearch?: () => void;
  followingOnly?: boolean;
  followingUserIds?: string[];
  onDisableFollowingOnly?: () => void;
}) {
  const { profile: myProfile } = useAuth();
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const enableExperiences = enableCountries && (!myProfile || myProfile.enable_experiences !== false);
  const [feedItems, setFeedItems] = useState<any[]>(() => globalCachedFeedItems || getStoredFeedItems() || []);
  const [loading, setLoading] = useState(() => (!globalCachedFeedItems && !getStoredFeedItems()) || (globalCachedFeedItems ? globalCachedFeedItems.length === 0 : false));

  useEffect(() => {
    if (!isActive) return;

    async function fetchFeed() {
      if (!supabase || isFetchingFeed) return;
      const now = Date.now();
      if (globalCachedFeedItems && globalCachedFeedItems.length > 0 && (now - globalFeedLastFetched < FEED_CACHE_TTL)) {
        setFeedItems(globalCachedFeedItems);
        setLoading(false);
        return;
      }

      if (!globalCachedFeedItems || globalCachedFeedItems.length === 0) {
        setLoading(true);
      }
      isFetchingFeed = true;

      const limit = 200;
      let ascents: any[] = [];
      let expRecords: any[] = [];
      let fetchError = null;

      // Fetch ascents
      const { data: ascData, error: ascErr } = await supabase
        .from("ascents")
        .select("id, user_id, summit_id, trip_group_id, created_at, achieved_on, end_date, notes, link, link_name, link_2, link_name_2, profiles!ascents_user_id_profiles_fkey(username, avatar_url, is_public, is_test)")
        .eq('is_wishlist', false)
        .or('summit_id.not.ilike.country-%,achieved_on.gt.1900-01-01')
        .order("created_at", { ascending: false })
        .limit(limit);

      if (ascErr) fetchError = ascErr.message;
      if (ascData) {
        ascents = ascData.filter((a: any) => {
          // Excluir perfiles de testeo / ocultos
          if (a.profiles?.is_test) return false;

          const summitIdLower = (a.summit_id || '').toLowerCase();
          if (summitIdLower.startsWith('region-')) return false;

          // Excluir cualquier registro que no tenga fecha establecida válida
          if (!a.achieved_on || isUnknownDate(a.achieved_on)) {
            return false;
          }

          return true;
        });
      }

      // Fetch experiences
      const { data: expData, error: expErr } = await supabase
        .from("experience_records")
        .select("id, user_id, experience_id, sub_item_id, trip_group_id, created_at, achieved_on, notes, link, link_name, link_2, link_name_2, location_name, profiles!experience_records_user_id_profiles_fkey(username, avatar_url, is_public, is_test)")
        .eq('is_wishlist', false)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (expErr && !fetchError) fetchError = expErr.message;
      if (expData) {
        expRecords = expData.filter((e: any) => {
          // Excluir perfiles de testeo / ocultos
          if (e.profiles?.is_test) return false;

          // Excluir cualquier experiencia que no tenga fecha establecida válida
          if (!e.achieved_on || isUnknownDate(e.achieved_on)) {
            return false;
          }
          return true;
        });
      }

      if (fetchError) {
        console.error("Error fetching feed:", fetchError);
        if (!globalCachedFeedItems || globalCachedFeedItems.length === 0) {
          setFeedItems([{ type: 'error', notes: fetchError, id: 'error-1' }]);
        }
        setLoading(false);
        isFetchingFeed = false;
        return;
      }

      // Combinar y ordenar cronológicamente por la fecha real de la actividad
      const combinedBase = [
        ...ascents.map(a => ({
          ...a,
          type: "ascent",
          record_date: a.achieved_on
        })),
        ...expRecords.map(e => ({
          ...e,
          type: "experience",
          record_date: e.achieved_on
        }))
      ].filter(item => item.record_date && !isNaN(new Date(item.record_date).getTime()))
       .sort(compareFeedRecords)
       .slice(0, limit);
       
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const customExpIds = combinedBase
        .filter(item => item.type === 'experience' && item.experience_id && UUID_REGEX.test(item.experience_id))
        .map(item => item.experience_id);
      const customExperiences: Record<string, string> = {};
      if (customExpIds.length > 0) {
        const { data: customExpData } = await supabase.from('custom_experiences').select('id, name').in('id', customExpIds);
        if (customExpData) {
          customExpData.forEach(ce => { customExperiences[ce.id] = ce.name; });
        }
      }
      
      const combined = combinedBase.map(item => {
        if (item.type === 'experience') {
          let title = '';
          let subTitle = '';
          
          let found = false;
          for (const cat of predefinedCategories) {
            const exp = cat.experiences.find(e => e.id === item.experience_id);
            if (exp) {
              title = exp.name;
              if (item.sub_item_id && exp.subItems) {
                const sub = exp.subItems.find((s: any) => s.id === item.sub_item_id);
                if (sub) subTitle = sub.name;
              }
              found = true;
              break;
            }
          }
          if (!found) {
             title = customExperiences[item.experience_id] || item.location_name || 'Experiencia';
          }
          return { ...item, experience_title: title, sub_item_title: subTitle };
        }
        return item;
      });

      // Fetch companions for trip_group_ids
      const tripGroupIds = Array.from(
        new Set(combinedBase.map((item) => item.trip_group_id).filter(Boolean))
      );
      const companionsByTripGroup: Record<string, any[]> = {};
      const canonicalTripGroupMap = new Map<string, string>();
      if (tripGroupIds.length > 0) {
        try {
          const { data: compData } = await supabase
            .from("record_companions")
            .select(`
              trip_group_id,
              status,
              inviter_id,
              companion_id,
              item_id,
              start_date,
              end_date,
              companion_profile:profiles!record_companions_companion_id_fkey(id, username, avatar_url, is_public),
              inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
            `)
            .in("trip_group_id", tripGroupIds)
            .eq("status", "accepted");

          if (compData) {
            // Group by trip key (item_id + start_date + mutual participants) to resolve canonical group IDs
            const tripKeyToCanonicalGid = new Map<string, string>();
            compData.forEach((row: any) => {
              const participants = [row.inviter_id, row.companion_id].sort().join(":");
              const tripKey = `${row.item_id || ""}:${row.start_date || ""}:${participants}`;
              if (!tripKeyToCanonicalGid.has(tripKey)) {
                tripKeyToCanonicalGid.set(tripKey, row.trip_group_id);
              }
              const canonicalGid = tripKeyToCanonicalGid.get(tripKey)!;
              canonicalTripGroupMap.set(row.trip_group_id, canonicalGid);
            });

            compData.forEach((row: any) => {
              const gid = canonicalTripGroupMap.get(row.trip_group_id) || row.trip_group_id;
              if (!companionsByTripGroup[gid]) {
                companionsByTripGroup[gid] = [];
              }
              if (row.companion_profile && !companionsByTripGroup[gid].some((p) => p.id === row.companion_profile.id)) {
                companionsByTripGroup[gid].push(row.companion_profile);
              }
              if (row.inviter_profile && !companionsByTripGroup[gid].some((p) => p.id === row.inviter_profile.id)) {
                companionsByTripGroup[gid].push(row.inviter_profile);
              }
            });
          }
        } catch (err) {
          console.warn("Could not fetch companions for feed:", err);
        }
      }

      // Attach companions to combined items and unify canonical trip_group_id
      combined.forEach((item) => {
        if (item.trip_group_id && canonicalTripGroupMap.has(item.trip_group_id)) {
          item.trip_group_id = canonicalTripGroupMap.get(item.trip_group_id);
        }
        item.companions = item.trip_group_id ? companionsByTripGroup[item.trip_group_id] || [] : [];
      });

      // Fetch photos for these users and summits
      // Build a set of unique (user_id, summit_id) pairs to fetch photos for
      const pairSet = new Set<string>();
      combined.forEach(item => {
        const baseId = item.summit_id || item.experience_id;
        if (!item.user_id || !baseId) return;

        // If it's a sub-experience (mini-experiencias como Coliseo en exp-7-wonders),
        // summit_photos lo guarda como `${baseId}::${sub_item_id}`
        if (item.sub_item_id) {
          pairSet.add(`${item.user_id}|${baseId}::${item.sub_item_id}`);
        }
        pairSet.add(`${item.user_id}|${baseId}`);
      });
      const pairs = [...pairSet].map(p => { const [u, s] = p.split('|'); return { user_id: u, summit_id: s }; });
      
      let photosMap = new Map();
      let photosMapBySummit = new Map();
      if (pairs.length > 0) {
        let uniquePhotos: any[] = [];

        // 1. Intentar primero con la función RPC get_feed_photos (join exacto sin producto cartesiano)
        const { data: rpcPhotos, error: rpcErr } = await supabase.rpc('get_feed_photos', { pairs });
        if (!rpcErr && Array.isArray(rpcPhotos)) {
          uniquePhotos = rpcPhotos;
        } else {
          // 2. Fallback: Consulta directa con PostgREST .or() disyuntivo para evitar el producto cartesiano
          const BATCH_SIZE = 25;
          const allPhotos: any[] = [];
          for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
            const batch = pairs.slice(i, i + BATCH_SIZE);
            const orFilter = batch
              .map(p => `and(user_id.eq.${p.user_id},summit_id.eq.${p.summit_id})`)
              .join(',');
            const { data: photosData } = await supabase
              .from('summit_photos')
              .select('id, user_id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at')
              .or(orFilter)
              .order('created_at', { ascending: true });
            if (photosData) allPhotos.push(...photosData);
          }

          // Deduplicate photos by id
          const seenIds = new Set<string>();
          uniquePhotos = allPhotos.filter(p => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          });
        }

        uniquePhotos.forEach(p => {
           // Key with exact date
           const key = `${p.user_id}_${p.summit_id}_${p.taken_on || ''}`;
           if (!photosMap.has(key)) photosMap.set(key, []);
           photosMap.get(key).push(p);

           // Also key by user and summit_id without date as fallback
           const summitKey = `${p.user_id}_${p.summit_id}`;
           if (!photosMapBySummit.has(summitKey)) photosMapBySummit.set(summitKey, []);
           photosMapBySummit.get(summitKey).push(p);
        });
      }

      // Attach photos to combined items
      combined.forEach(item => {
         const baseId = item.summit_id || item.experience_id;
         const targetId = item.sub_item_id ? `${baseId}::${item.sub_item_id}` : baseId;
         const recordDate = item.achieved_on || '';

         // 1. Match targetId (including sub_item_id) with exact date
         let matched = (targetId && recordDate) ? photosMap.get(`${item.user_id}_${targetId}_${recordDate}`) : null;

         // 2. If sub_item_id exists but not matched by date, try baseId with exact date
         if ((!matched || matched.length === 0) && baseId && baseId !== targetId && recordDate) {
           matched = photosMap.get(`${item.user_id}_${baseId}_${recordDate}`);
         }

         // 3. Fallback: match targetId without date
         if ((!matched || matched.length === 0) && targetId) {
           matched = photosMapBySummit.get(`${item.user_id}_${targetId}`);
         }

         // 4. Fallback: match baseId without date
         if ((!matched || matched.length === 0) && baseId) {
           matched = photosMapBySummit.get(`${item.user_id}_${baseId}`);
         }

         item.photos = sortPhotosByTime(matched || []);
      });
      


      globalCachedFeedItems = combined;
      globalFeedLastFetched = Date.now();
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("app_cached_feed_items", JSON.stringify(combined.slice(0, 50)));
        } catch { /* ignore */ }

        // Precargar inmediatamente las fotos de los primeros elementos en el navegador
        try {
          const topPhotosToPreload: string[] = [];
          for (const feedItem of combined.slice(0, 6)) {
            if (feedItem.photos && Array.isArray(feedItem.photos)) {
              for (const p of feedItem.photos) {
                if (p?.public_url) topPhotosToPreload.push(p.public_url);
              }
            }
          }
          topPhotosToPreload.slice(0, 8).forEach((url) => {
            const img = new Image();
            img.src = url;
          });
        } catch { /* ignore */ }
      }
      setFeedItems(combined);
      setLoading(false);
      isFetchingFeed = false;
    }
    
    fetchFeed();
  }, [isActive]);

  const followingUserIdsSet = useMemo(
    () => new Set(followingUserIds || []),
    [followingUserIds]
  );

  const visibleFeedItems = useMemo(() => {
    let items = feedItems.filter((item) => {
      if (item.type === "error") return true;

      if (followingOnly) {
        if (!item.user_id || !followingUserIdsSet.has(item.user_id)) {
          return false;
        }
      }

      const summitIdLower = (item.summit_id || "").toLowerCase();
      const isPeak = item.type === "ascent" && peaks.some((p) => p.id === summitIdLower);
      const isCountry =
        item.type === "ascent" &&
        (countries.some((c) => c.id === summitIdLower) || summitIdLower.startsWith("country-"));
      const isExperience =
        item.type === "experience" ||
        (item.type === "ascent" && (summitIdLower.startsWith("exp-") || summitIdLower.startsWith("custom-")));

      if (item.type === "ascent") {
        if (!enablePeaks && isPeak) return false;
        if (!enableCountries && isCountry) return false;
      }
      if (!enableExperiences && isExperience) return false;

      if (mode === "peaks") {
        return isPeak;
      } else {
        // mode === "countries"
        if (isPeak) return false;
        if (experiencesMode && enableExperiences) {
          return isExperience;
        }
        return isCountry;
      }
    });

    if (searchQuery.trim()) {
      const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter((item) => {
        const username = item.profiles?.username || "";
        const summitIdLower = (item.summit_id || "").toLowerCase();

        let locName = "";
        let extraLoc = "";
        if (item.type === "ascent") {
          const country = countries.find((c) => c.id === summitIdLower);
          if (country) {
            locName = country.name;
          } else {
            const peak = peaks.find((p) => p.id === summitIdLower);
            if (peak) {
              locName = peak.name;
              extraLoc = peak.province || "";
            }
          }
        } else if (item.type === "experience") {
          locName = item.experience_title || item.location_name || "";
          extraLoc = item.sub_item_title || "";
        }

        const dateRangeStr = formatRecordDateRange(item.achieved_on, item.end_date);

        let dateWords = "";
        if (item.achieved_on && !isUnknownDate(item.achieved_on)) {
          try {
            const d = new Date(item.achieved_on);
            if (!isNaN(d.getTime())) {
              dateWords += " " + format(d, "MMMM yyyy d", { locale: es });
            }
          } catch {
            /* ignore */
          }
        }
        if (item.end_date && !isUnknownDate(item.end_date)) {
          try {
            const d2 = new Date(item.end_date);
            if (!isNaN(d2.getTime())) {
              dateWords += " " + format(d2, "MMMM yyyy d", { locale: es });
            }
          } catch {
            /* ignore */
          }
        }

        const searchable = [
          username,
          `@${username}`,
          locName,
          extraLoc,
          item.location_name || "",
          item.notes || "",
          dateRangeStr,
          dateWords,
          item.achieved_on || "",
          item.end_date || "",
        ]
          .join(" ")
          .toLowerCase();

        return tokens.every((t) => searchable.includes(t));
      });
    }

    return items;
  }, [
    feedItems,
    enablePeaks,
    enableCountries,
    enableExperiences,
    mode,
    experiencesMode,
    searchQuery,
    followingOnly,
    followingUserIdsSet,
  ]);

  return (
    <div className="feed-container">
      {/* Feed List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Cargando novedades...</div>
      ) : visibleFeedItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
          {searchQuery.trim() ? (
            <>
              <div>No se encontraron actividades para &ldquo;{searchQuery}&rdquo;.</div>
              {onClearSearch && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="feed-empty-link"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </>
          ) : followingOnly ? (
            <>
              <div>No hay actividades recientes de personas a las que sigues.</div>
              {followingUserIds.length === 0 ? (
                <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--muted)' }}>
                  Aún no sigues a nadie. ¡Descubre otros exploradores en la comunidad!
                </div>
              ) : null}
              {onDisableFollowingOnly && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={onDisableFollowingOnly}
                    className="feed-empty-link"
                  >
                    Ver todas las actividades
                  </button>
                </div>
              )}
            </>
          ) : (
            "No hay actividad reciente para mostrar."
          )}
        </div>
      ) : (
        <div>
          {visibleFeedItems.map((item, index) => {
            const prevItem = index > 0 ? visibleFeedItems[index - 1] : null;
            const nextItem = index < visibleFeedItems.length - 1 ? visibleFeedItems[index + 1] : null;

            const isConnectedToPrev = areFeedItemsConnected(prevItem, item);
            const isConnectedToNext = areFeedItemsConnected(item, nextItem);

            return (
              <FeedItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                index={index}
                session={session}
                onAuthRequired={onAuthRequired}
                isConnectedToPrev={isConnectedToPrev}
                isConnectedToNext={isConnectedToNext}
                followingUserIdsSet={followingUserIdsSet}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
