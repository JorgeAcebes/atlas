"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { compareFeedRecords, areFeedItemsConnected } from "@/lib/feed-sort";
import { fetchCombinedFeed } from "@/lib/feed-fetcher";
import { filterFeedItems } from "@/lib/feed-filter";
import { preloadImages } from "@/lib/image-preloader";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { useAuth } from "./auth-context";
import { FeedItemCard } from "./feed/feed-item-card";

export { compareFeedRecords, areFeedItemsConnected };

const PAGE_SIZE = 20;
const FEED_CACHE_TTL = 60 * 1000;
const FEED_PREFETCH_EVENT = "atlas:feed-prefetched";

let globalCachedFeedItems: any[] | null = null;
let globalFeedLastFetched = 0;
let isFetchingFeed = false;

function getStoredFeedItems(): any[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("app_cached_feed_items");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function collectFeedItemMediaUrls(items: any[]): string[] {
  const urls: string[] = [];
  for (const item of items) {
    const avatarUrl = item?.profiles?.avatar_url
      ? getPhotoDisplayUrl(item.profiles.avatar_url)
      : "";
    if (avatarUrl) urls.push(avatarUrl);

    if (Array.isArray(item?.photos)) {
      for (const photo of item.photos.slice(0, 4)) {
        const photoUrl = getPhotoDisplayUrl(photo?.public_url, photo?.storage_path);
        if (photoUrl) urls.push(photoUrl);
      }
    }
  }
  return urls;
}

/**
 * Warms global feed cache + initial thumbnails on browser idle before the user visits Social.
 */
export async function prefetchFeedInBackground(): Promise<void> {
  if (typeof window === "undefined" || !supabase || isFetchingFeed) return;
  const now = Date.now();
  if (
    globalCachedFeedItems &&
    globalCachedFeedItems.length > 0 &&
    now - globalFeedLastFetched < FEED_CACHE_TTL
  ) {
    return;
  }

  isFetchingFeed = true;
  try {
    const result = await fetchCombinedFeed(200);
    if (result.error) return;
    globalCachedFeedItems = result.items;
    globalFeedLastFetched = Date.now();
    try {
      sessionStorage.setItem(
        "app_cached_feed_items",
        JSON.stringify(result.items.slice(0, 50))
      );
    } catch {
      /* ignore */
    }
    preloadImages(result.preloadUrls, { maxConcurrent: 3, maxCount: 15 });
    window.dispatchEvent(new CustomEvent(FEED_PREFETCH_EVENT));
  } catch {
    /* ignore background prefetch errors */
  } finally {
    isFetchingFeed = false;
  }
}

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

  const [feedItems, setFeedItems] = useState<any[]>(
    () => globalCachedFeedItems || getStoredFeedItems() || []
  );
  const [loading, setLoading] = useState(
    () =>
      (!globalCachedFeedItems && !getStoredFeedItems()) ||
      (globalCachedFeedItems ? globalCachedFeedItems.length === 0 : false)
  );
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [mode, experiencesMode, followingOnly, deferredSearchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePrefetched = () => {
      if (globalCachedFeedItems && globalCachedFeedItems.length > 0) {
        setFeedItems(globalCachedFeedItems);
        setLoading(false);
      }
    };
    window.addEventListener(FEED_PREFETCH_EVENT, handlePrefetched);
    return () => window.removeEventListener(FEED_PREFETCH_EVENT, handlePrefetched);
  }, []);

  useEffect(() => {
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function loadFeed(isBackground = false) {
      if (!supabase) return;
      const now = Date.now();
      if (
        globalCachedFeedItems &&
        globalCachedFeedItems.length > 0 &&
        now - globalFeedLastFetched < FEED_CACHE_TTL
      ) {
        setFeedItems(globalCachedFeedItems);
        setLoading(false);
        return;
      }

      if (isFetchingFeed) return;

      if (!isBackground && (!globalCachedFeedItems || globalCachedFeedItems.length === 0)) {
        const stored = getStoredFeedItems();
        if (!stored || stored.length === 0) {
          setLoading(true);
        }
      }

      isFetchingFeed = true;
      try {
        const result = await fetchCombinedFeed(200);
        if (result.error) {
          console.error("Error fetching feed:", result.error);
          if (!ignore && (!globalCachedFeedItems || globalCachedFeedItems.length === 0)) {
            setFeedItems([{ type: "error", notes: result.error, id: "error-1" }]);
          }
          if (!ignore) setLoading(false);
          return;
        }

        globalCachedFeedItems = result.items;
        globalFeedLastFetched = Date.now();
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              "app_cached_feed_items",
              JSON.stringify(result.items.slice(0, 50))
            );
          } catch {
            /* ignore */
          }
          preloadImages(result.preloadUrls, { maxConcurrent: 3, maxCount: 9 });
        }

        if (!ignore) {
          setFeedItems(result.items);
          setLoading(false);
        }
      } finally {
        isFetchingFeed = false;
      }
    }

    if (isActive) {
      loadFeed(false);
    } else {
      timer = setTimeout(() => {
        if (!ignore) loadFeed(true);
      }, 1100);
    }

    return () => {
      ignore = true;
      if (timer) clearTimeout(timer);
    };
  }, [isActive]);

  const followingUserIdsSet = useMemo(
    () => new Set(followingUserIds || []),
    [followingUserIds]
  );

  const visibleFeedItems = useMemo(
    () =>
      filterFeedItems({
        feedItems,
        enablePeaks,
        enableCountries,
        enableExperiences,
        mode,
        experiencesMode,
        searchQuery: deferredSearchQuery,
        followingOnly,
        followingUserIdsSet,
      }),
    [
      feedItems,
      enablePeaks,
      enableCountries,
      enableExperiences,
      mode,
      experiencesMode,
      deferredSearchQuery,
      followingOnly,
      followingUserIdsSet,
    ]
  );

  const visibleFeedItemsRef = useRef(visibleFeedItems);
  visibleFeedItemsRef.current = visibleFeedItems;

  const paginatedItems = useMemo(
    () => visibleFeedItems.slice(0, visibleLimit),
    [visibleFeedItems, visibleLimit]
  );
  const hasMoreItems = visibleFeedItems.length > paginatedItems.length;

  // Filter-aware preload: warm full photo grids & avatars for the first 6 visible cards of the active tab/filter
  useEffect(() => {
    if (!isActive || visibleFeedItems.length === 0) return;
    const urls = collectFeedItemMediaUrls(visibleFeedItems.slice(0, 6));
    if (urls.length > 0) {
      preloadImages(urls, { maxConcurrent: 3, maxCount: 20, immediate: true });
    }
  }, [isActive, visibleFeedItems]);

  // Look-ahead scroll radar: proactively fetch & decode upcoming 6 cards' photos 1400px ahead of viewport
  useEffect(() => {
    if (!isActive || typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const rootEl = listContainerRef.current;
    if (!rootEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let maxIdx = -1;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).getAttribute("data-feed-index"));
          if (Number.isFinite(idx) && idx > maxIdx) maxIdx = idx;
          observer.unobserve(entry.target);
        }
        if (maxIdx >= 0) {
          const lookaheadSlice = visibleFeedItemsRef.current.slice(maxIdx + 1, maxIdx + 7);
          const urls = collectFeedItemMediaUrls(lookaheadSlice);
          if (urls.length > 0) {
            preloadImages(urls, { maxConcurrent: 3, maxCount: 24, immediate: true });
          }
        }
      },
      { rootMargin: "1400px 0px", threshold: 0 }
    );

    const cards = rootEl.querySelectorAll("[data-feed-index]");
    cards.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [isActive, paginatedItems.length, mode, experiencesMode, followingOnly, deferredSearchQuery]);

  // Auto-pagination sentinel: extend feed seamlessly 900px before hitting the bottom
  useEffect(() => {
    if (
      !isActive ||
      !hasMoreItems ||
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleLimit((prev) => {
            const next = prev + PAGE_SIZE;
            const nextBatchUrls = collectFeedItemMediaUrls(
              visibleFeedItemsRef.current.slice(prev, next + 4)
            );
            if (nextBatchUrls.length > 0) {
              preloadImages(nextBatchUrls, { maxConcurrent: 3, maxCount: 20, immediate: true });
            }
            return next;
          });
        }
      },
      { rootMargin: "900px 0px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isActive, hasMoreItems, visibleLimit]);

  return (
    <div className="feed-container">
      {loading ? (
        <div className="feed-skeleton-list" aria-busy="true" aria-label="Cargando novedades">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="feed-card feed-skeleton-card">
              <div className="feed-card-header">
                <div className="feed-skeleton-avatar photo-shimmer" />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="feed-skeleton-line feed-skeleton-line--title photo-shimmer" />
                  <div className="feed-skeleton-line feed-skeleton-line--sub photo-shimmer" />
                </div>
              </div>
              <div className="feed-skeleton-media photo-shimmer" />
            </div>
          ))}
        </div>
      ) : visibleFeedItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>
          {searchQuery.trim() ? (
            <>
              <div>No se encontraron actividades para &ldquo;{searchQuery}&rdquo;.</div>
              {onClearSearch && (
                <div style={{ marginTop: "10px" }}>
                  <button type="button" onClick={onClearSearch} className="feed-empty-link">
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </>
          ) : followingOnly ? (
            <>
              <div>No hay actividades recientes de personas a las que sigues.</div>
              {followingUserIds.length === 0 && (
                <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--muted)" }}>
                  Aún no sigues a nadie. ¡Descubre otros exploradores en la comunidad!
                </div>
              )}
              {onDisableFollowingOnly && (
                <div style={{ marginTop: "12px" }}>
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
        <div ref={listContainerRef}>
          {paginatedItems.map((item, index) => {
            const prevItem = index > 0 ? paginatedItems[index - 1] : null;
            const nextItem = index < paginatedItems.length - 1 ? paginatedItems[index + 1] : null;

            return (
              <FeedItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                index={index}
                session={session}
                onAuthRequired={onAuthRequired}
                isConnectedToPrev={areFeedItemsConnected(prevItem, item)}
                isConnectedToNext={areFeedItemsConnected(item, nextItem)}
                followingUserIdsSet={followingUserIdsSet}
              />
            );
          })}

          {hasMoreItems && (
            <div
              ref={loadMoreSentinelRef}
              style={{ display: "flex", justifyContent: "center", marginTop: "12px" }}
            >
              <button
                type="button"
                className="feed-empty-link feed-load-more-btn"
                onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
              >
                Cargar más ({visibleFeedItems.length - paginatedItems.length} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
