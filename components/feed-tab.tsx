"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { compareFeedRecords, areFeedItemsConnected } from "@/lib/feed-sort";
import { fetchCombinedFeed } from "@/lib/feed-fetcher";
import { filterFeedItems } from "@/lib/feed-filter";
import { preloadImages } from "@/lib/image-preloader";
import { useAuth } from "./auth-context";
import { FeedItemCard } from "./feed/feed-item-card";

export { compareFeedRecords, areFeedItemsConnected };

const PAGE_SIZE = 20;
const FEED_CACHE_TTL = 60 * 1000;

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

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [mode, experiencesMode, followingOnly, deferredSearchQuery]);

  useEffect(() => {
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function loadFeed(isBackground = false) {
      if (!supabase || isFetchingFeed) return;
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

      if (!isBackground && (!globalCachedFeedItems || globalCachedFeedItems.length === 0)) {
        setLoading(true);
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

  const paginatedItems = useMemo(
    () => visibleFeedItems.slice(0, visibleLimit),
    [visibleFeedItems, visibleLimit]
  );
  const hasMoreItems = visibleFeedItems.length > paginatedItems.length;

  return (
    <div className="feed-container">
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>
          Cargando novedades...
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
        <div>
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
            <div style={{ display: "flex", justifyContent: "center", marginTop: "12px" }}>
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
