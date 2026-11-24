import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { feature } from "topojson-client";
import { resolveCountryFromFeature } from "@/data/countries";
import { peakByCode } from "@/data/peaks";
import { filterFeedItems } from "@/lib/feed-filter";
import { peakCodesById, peakProvincesById } from "@/lib/progress-utils";
import {
  computeExperienceStats,
  computePeaksAndCountriesStats,
} from "@/lib/stats-calculations";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { readFile } from "@/tests/utils/source-reader";

describe("Infraestructura, caché CDN y preconnects", () => {
  it("reutiliza el cliente singleton getR2Client() al subir objetos a R2", () => {
    const src = readFile("lib/r2-storage.ts");
    expect(src).toContain("uploadR2Object");
    expect(src).toContain("getR2Client()");
  });

  it("emite CDN-Cache-Control inmutable en /api/photos/view", () => {
    const src = readFile("app/api/photos/view/[...path]/route.ts");
    expect(src).toContain("CDN-Cache-Control");
    expect(src).toContain("public, max-age=31536000, immutable");
  });

  it("declara preconnect hacia OpenStreetMap y Supabase en app/layout.tsx", () => {
    const src = readFile("app/layout.tsx");
    expect(src).toContain('rel="preconnect"');
    expect(src).toContain("https://tile.openstreetmap.org");
    expect(src).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("Corrección de scroll en Social/Ranking y precarga en reposo", () => {
  it("AppTabsShell limpia scroll locks, usa display block, normaliza lastPathRef y precarga tabs en idle", () => {
    const src = readFile("components/app-tabs-shell.tsx");
    expect(src).toContain("resetScrollLock()");
    expect(src).toContain('finalPath.split("?")[0].split("#")[0]');
    expect(src).toContain("scrollBehavior");
    expect(src).toContain("prefetchFeedInBackground");
    expect(src).toContain("prefetchRankingInBackground");
    expect(src).not.toContain('display: "contents"');
  });

  it("SummitTracker y InstallPrompt respetan isActive para no bloquear scroll en pestañas ocultas", () => {
    const tracker = readFile("components/summit-tracker.tsx");
    const prompt = readFile("components/install-prompt.tsx");
    expect(tracker).toContain("isActive && isScrollLocked");
    expect(prompt).toContain("isActive");
    expect(prompt).toContain("useScrollLock(showPrompt)");
  });

  it("Ranking precarga avatares en segundo plano y renderiza esqueletos inmediatos", () => {
    const hook = readFile("hooks/use-ranking-data.ts");
    const table = readFile("components/ranking/ranking-table.tsx");
    const css = readFile("components/ranking.css");
    expect(hook).toContain("prefetchRankingInBackground");
    expect(hook).toContain("preloadImages");
    expect(table).toContain("ranking-skeleton-row");
    expect(css).toContain(".ranking-skeleton-row");
  });
});

describe("Percepción instantánea de fotos en el feed y Service Worker v14", () => {
  it("FeedTab implementa radar anticipado de 1400px, auto-paginación de 900px, esqueletos y precarga filtrada", () => {
    const feed = readFile("components/feed-tab.tsx");
    const fetcher = readFile("lib/feed-fetcher.ts");
    expect(feed).toContain("prefetchFeedInBackground");
    expect(feed).toContain("IntersectionObserver");
    expect(feed).toContain("1400");
    expect(feed).toContain("900");
    expect(feed).toContain("feed-skeleton-card");
    expect(fetcher).toContain("preloadSet");
  });

  it("ProgressiveFeedImg evita parpadeos en caché, decodifica imágenes y siembra el Service Worker v14", () => {
    const card = readFile("components/feed/feed-item-card.tsx");
    const preloader = readFile("lib/image-preloader.ts");
    const sw = readFile("public/sw.js");
    const css = readFile("styles/social-feed.css");

    expect(card).toContain("ProgressiveFeedImg");
    expect(card).toContain("photo-shimmer");
    expect(card).toContain("data-feed-index");
    expect(css).toContain(".photo-shimmer");
    expect(css).toContain(".feed-skeleton-card");

    expect(preloader).toContain("ATLAS_PHOTOS_CACHE_NAME");
    expect(preloader).toContain("atlas-photos-v14");
    expect(preloader).toContain("img.decode()");
    expect(preloader).toContain("seedPhotoServiceWorkerCache");

    expect(sw).toContain('CACHE_VERSION = "v14"');
    expect(sw).toContain("MAX_PHOTO_CACHE_ENTRIES = 250");
    expect(sw).toContain("MAX_TILE_CACHE_ENTRIES = 600");
  });
});

describe("Subida optimista, pre-compresión y endpoint batch", () => {
  it("pre-comprime fotos al elegir archivos y sube por lotes dentro del límite serverless", () => {
    const utils = readFile("lib/image-utils.ts");
    const modal = readFile("components/tracker/record-form-modal.tsx");
    const client = readFile("lib/photo-client.ts");
    const route = readFile("app/api/photos/upload/route.ts");

    expect(utils).toContain("precompressPhotoFile");
    expect(modal).toContain("precompressPhotoFile");
    expect(client).toContain("uploadPhotoBlobsBatch");
    expect(route).toContain("MAX_BATCH_FILES = 4");
    expect(route).toContain("checkStorageLimit(totalBytes");
    expect(route).not.toContain('.from("summit-photos").upload');
  });

  it("UploadQueueProvider protege cierres activos y permite reintentar o descartar errores", () => {
    const ctx = readFile("components/upload-queue-context.tsx");
    const providers = readFile("components/providers.tsx");
    const mut = readFile("components/tracker/hooks/use-record-mutations.ts");

    expect(ctx).toContain("UploadQueueProvider");
    expect(ctx).toContain("beforeunload");
    expect(ctx).toContain("seedPhotoServiceWorkerCache");
    expect(ctx).toContain("handleRetry");
    expect(ctx).toContain("handleDismiss");
    expect(providers).toContain("<UploadQueueProvider>");
    expect(mut).toContain("enqueuePhotoUpload");
    expect(mut).toContain("uploading-");
  });
});

describe("Fluidez de mapas, hover SVG aislado, zoom mundial y TopoJSON", () => {
  it("Canvas patch mantiene padX/padY acotado y lifecycle usa guardia pasiva _isWheeling + HoverHighlightBridge", () => {
    const patch = readFile("lib/leaflet-canvas-patch.ts");
    const lifecycle = readFile("components/maps/map-lifecycle.tsx");
    const mapsCss = readFile("styles/maps.css");

    expect(patch).toContain("Math.min(120, Math.max(48, Math.round(size.x * 0.18)))");
    expect(patch).toContain("Math.min(120, Math.max(48, Math.round(size.y * 0.18)))");
    expect(lifecycle).toContain("_isWheeling = true");
    expect(lifecycle).toContain("is-wheeling");
    expect(lifecycle).toContain("HoverHighlightBridge");
    expect(lifecycle).toContain("L.svg({ padding: 0.25 })");
    expect(mapsCss).toContain(".leaflet-zoom-anim .leaflet-zoom-animated");
  });

  it("WorldMap y SpainMap aíslan el hover en SVG, mantienen OpenStreetMap unificado y World arranca +1 zoom sin Antártida", () => {
    const world = readFile("components/world-map.tsx");
    const spain = readFile("components/spain-map.tsx");
    const collective = readFile("components/collective-map.tsx");
    const bounds = readFile("lib/leaflet-bounds.ts");

    for (const mapSrc of [world, spain, collective]) {
      expect(mapSrc).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
      expect(mapSrc).toContain("getAdaptiveInertiaOptions");
      expect(mapSrc).toContain("inertiaDeceleration={inertiaOptions.inertiaDeceleration}");
      expect(mapSrc).toContain("inertiaMaxSpeed={inertiaOptions.inertiaMaxSpeed}");
      expect(mapSrc).toContain("easeLinearity={inertiaOptions.easeLinearity}");
      expect(mapSrc).toContain('crossOrigin="anonymous"');
    }
    for (const mapSrc of [world, collective]) {
      expect(mapSrc).toContain("wheelDebounceTime={25}");
    }
    expect(spain).toContain("wheelDebounceTime={20}");
    expect(spain).toContain("wheelPxPerZoomLevel={85}");

    expect(world).toContain("<HoverHighlightBridge");
    expect(spain).toContain("<HoverHighlightBridge");
    expect(world).toContain("[-60, -180]");
    expect(bounds).toContain("Math.floor(fittedZoom) + 1");
  });

  it("TopoJSON simplificados preservan los 195 países resolubles, las 52 provincias y geometría válida", () => {
    const worldRaw = JSON.parse(readFile("public/world-countries.topo.json"));
    const worldVertices = worldRaw.arcs.reduce((s: number, a: unknown[]) => s + a.length, 0);
    expect(worldVertices).toBeLessThan(40000);

    const worldFc = feature(worldRaw, worldRaw.objects.countries) as any;
    expect(worldFc.features).toHaveLength(241);
    const resolvedCountries = new Set(
      worldFc.features.map((f: any) => resolveCountryFromFeature(f)?.id).filter(Boolean)
    );
    expect(resolvedCountries.size).toBeGreaterThanOrEqual(195);

    const landFc = feature(worldRaw, worldRaw.objects.land) as any;
    expect(landFc.features.length).toBeGreaterThan(0);

    const spainRaw = JSON.parse(readFile("public/provincias_spain.topo.json"));
    const spainVertices = spainRaw.arcs.reduce((s: number, a: unknown[]) => s + a.length, 0);
    expect(spainVertices).toBeLessThan(22000);

    const spainFc = feature(spainRaw, spainRaw.objects.provincias) as any;
    expect(spainFc.features).toHaveLength(52);
    const spainCodes = new Set(
      spainFc.features.map((f: any) => f?.properties?.Codigo).filter((c: string) => Boolean(c && peakByCode[c]))
    );
    expect(spainCodes.size).toBe(52);
  });
});

describe("Limites de zoom en móvil, sin animación inicial, Stats, swipe en lista y perfil SSR", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;

    if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  });

  it("WorldMap y CollectiveMap bloquean zoom-out en móvil por debajo de zoom 2 y eliminan la franja superior", () => {
    const world = readFile("components/world-map.tsx");
    const collective = readFile("components/collective-map.tsx");
    const bounds = readFile("lib/leaflet-bounds.ts");
    const mapsCss = readFile("styles/maps.css");

    expect(world).toContain("minZoom={2}");
    expect(world).toContain("maxBoundsViscosity={1.0}");
    expect(collective).toContain("minZoom={isPeaks ? 5 : 2}");
    expect(collective).toContain("maxBoundsViscosity={isPeaks ? 0.5 : 1.0}");
    expect(bounds).toContain("aspectRatio > 1");
    expect(mapsCss).toContain("background: #aad3df;");
    expect(mapsCss).toContain("background-color: #aad3df;");
  });

  it("la animación inicial de entrada ha sido eliminada de providers, base.css y disco", () => {
    expect(fs.existsSync(path.join(process.cwd(), "components/entry-intro-overlay.tsx"))).toBe(false);
    const providers = readFile("components/providers.tsx");
    const baseCss = readFile("styles/base.css");
    expect(providers).not.toContain("EntryIntroOverlay");
    expect(baseCss).not.toContain(".atlas-entry-intro");
  });

  it("Stats no entra a Experiencias por swipe/scroll, respeta 47 cimas en altitudes y excluye hiddenItems", () => {
    const modal = readFile("components/stats-modal.tsx");
    expect(modal).not.toContain('switchStatsMode("experiences")\n');
    expect(modal).toMatch(/advanceMode\s*=\s*\(delta:\s*number\)\s*=>\s*\{[\s\S]*?if\s*\(delta\s*>\s*0\)\s*\{\s*if\s*\(activeMode === "peaks" && canShowCountries\) switchStatsMode\("countries"\);/);
    expect(modal).toContain("canShowExperiences");
    expect(modal).toContain("fetchedFallbackForUserRef");
    expect(modal).toContain("hiddenItems");

    const metrics = computePeaksAndCountriesStats([]);
    expect(metrics.twoThousandersTotal + metrics.midTotal + metrics.lowTotal).toBe(47);

    const allExp = computeExperienceStats([], [], [], []);
    const oneHidden = computeExperienceStats([], [], [], [], [
      { item_id: allExp.categoriesStatus[0].id, item_type: "category" },
    ]);
    expect(oneHidden.totalCount).toBeLessThan(allExp.totalCount);
  });

  it("useHorizontalModeSwipe permite deslizar horizontalmente o usar rueda en la lista de países/picos", () => {
    const swipeHook = readFile("hooks/use-horizontal-mode-swipe.ts");
    expect(swipeHook).not.toContain(", button, a");
    expect(swipeHook).toContain(".list-filters");
    expect(swipeHook).toContain(".stats-overlay");
    expect(swipeHook).toContain("handleGlobalWheel");
    expect(swipeHook).toContain('addEventListener("wheel", handleGlobalWheel');
  });

  it("/perfil/[username] pre-hidrata datos públicos desde SSR sin exponer privados y acelera ProfileView", () => {
    const serverProfile = readFile("lib/profile-server.ts");
    const page = readFile("app/perfil/[username]/page.tsx");
    const view = readFile("components/profile-view.tsx");
    const tracker = readFile("components/summit-tracker.tsx");
    const dataHook = readFile("components/tracker/hooks/use-tracker-data.ts");

    expect(serverProfile).toContain("getServerInitialProfileData");
    expect(serverProfile).toContain("if (profile.is_public === false)");
    expect(page).toContain("getServerInitialProfileData");
    expect(page).toContain("initialProfile={initialData.profile}");
    expect(page).toContain("initialTrackerData={initialData.trackerData}");

    expect(view).toContain("fetchWorldGeo()");
    expect(view).toContain("fetchSpainGeo()");
    expect(view).toContain("profileCacheByUsername");
    expect(view).toContain("initialTrackerData={resolvedTrackerData}");

    expect(tracker).toContain("initialTargetConnStatus !== undefined");
    expect(tracker).toContain("hiddenItems={hiddenItems}");
    expect(dataHook).toContain("cachedMyAscentsForComparison");
    expect(dataHook).toContain("initialTrackerData.userId === targetId");
  });

  it("getSupabaseServerClient devuelve null con placeholders de CI (mock.supabase.co)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
    expect(getSupabaseServerClient()).toBeNull();

    const metaSrc = readFile("lib/record-metadata.ts");
    expect(metaSrc).toContain("if (profile?.is_test)");
    expect(metaSrc).toContain("if (profileErr || !profile)");
  });

  it("picos compartidos marcan ambas provincias (Peñalara Madrid/Segovia, etc.), límites en Canarias y carga fiable de tiles en /picos", () => {
    expect(peakCodesById.get("penalara")).toEqual(["28", "40"]);
    expect(peakProvincesById.get("penalara")).toEqual(["Madrid", "Segovia"]);
    expect(peakCodesById.get("gorbea")).toEqual(["01", "48"]);
    expect(peakCodesById.get("cerredo")).toEqual(["24", "33"]);
    expect(peakCodesById.get("trevinca")).toEqual(["32", "49"]);
    expect(peakCodesById.get("moncayo")).toEqual(["42", "50"]);

    const feedItem = {
      id: "asc-1",
      type: "ascent",
      user_id: "u1",
      summit_id: "penalara",
      achieved_on: "2026-06-15",
    };
    const madridMatch = filterFeedItems({
      feedItems: [feedItem],
      enablePeaks: true,
      enableCountries: true,
      enableExperiences: true,
      mode: "peaks",
      experiencesMode: false,
      searchQuery: "Madrid",
      followingOnly: false,
      followingUserIdsSet: new Set(),
    });
    const segoviaMatch = filterFeedItems({
      feedItems: [feedItem],
      enablePeaks: true,
      enableCountries: true,
      enableExperiences: true,
      mode: "peaks",
      experiencesMode: false,
      searchQuery: "Segovia",
      followingOnly: false,
      followingUserIdsSet: new Set(),
    });
    expect(madridMatch).toHaveLength(1);
    expect(segoviaMatch).toHaveLength(1);

    const dataHook = readFile("components/tracker/hooks/use-tracker-data.ts");
    expect(dataHook).toContain("peakCodesById.get(a.summit_id)");

    const spain = readFile("components/spain-map.tsx");
    expect(spain).toContain("activeCodes");
    expect(spain).toContain("minZoom={5}");
    expect(spain).toContain("[26.0, -19.8]");
    expect(spain).toContain("<MapTileWakeup");
    expect(spain).toContain("createTileRetryHandlers");

    const lifecycle = readFile("components/maps/map-lifecycle.tsx");
    expect(lifecycle).toContain("ResizeObserver");
    expect(lifecycle).toContain("export function MapTileWakeup");
    expect(lifecycle).toContain("export function createTileRetryHandlers");

    const sw = readFile("public/sw.js");
    expect(sw).toContain("single transient retry");
    expect(sw).toContain('response.type !== "opaque"');
    expect(sw).toContain("isRetryReq");
  });
});

describe("Fricción adaptativa móvil, carga fiable de tiles, transición instantánea Social/Ranking y cambio de modo en Stats", () => {
  const originalWindow = (globalThis as any).window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.doUnmock("leaflet");
    vi.resetModules();
    if (originalWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = originalWindow;
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    } catch {
      /* ignore */
    }
  });

  it("getAdaptiveInertiaOptions aplica mayor fricción y velocidad tope acotada en móvil y escritorio", async () => {
    vi.doMock("leaflet", () => ({ default: {} }));
    const { getAdaptiveInertiaOptions } = await import("@/lib/leaflet-canvas-patch");

    (globalThis as any).window = { innerWidth: 1440 };
    try {
      Object.defineProperty(navigator, "userAgent", {
        value:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        configurable: true,
      });
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 0,
        configurable: true,
      });
    } catch {
      /* ignore */
    }
    const desktopOpts = getAdaptiveInertiaOptions();
    expect(desktopOpts.inertia).toBe(true);
    expect(desktopOpts.inertiaDeceleration).toBeGreaterThanOrEqual(4000);
    expect(desktopOpts.inertiaMaxSpeed).toBeLessThanOrEqual(750);

    (globalThis as any).window = { innerWidth: 390 };
    const mobileOpts = getAdaptiveInertiaOptions();
    expect(mobileOpts.inertia).toBe(true);
    expect(mobileOpts.inertiaDeceleration).toBeGreaterThanOrEqual(6000);
    expect(mobileOpts.inertiaMaxSpeed).toBeLessThanOrEqual(500);
  });

  it("MapTileWakeup recupera tiles sin abortar descargas en curso y TrackerMapSection difiere cambios ocultos", () => {
    const lifecycle = readFile("components/maps/map-lifecycle.tsx");
    expect(lifecycle).toContain("revealCompletedTiles");
    expect(lifecycle).toContain("total === 0 || (allowRedrawWhenLoadedZero && loaded === 0)");
    expect(lifecycle).toContain("earlyTimer");
    expect(lifecycle).toContain("stallTimer");

    const mapSection = readFile("components/tracker/tracker-map-section.tsx");
    expect(mapSection).toContain("lastActiveIsPeaksRef");
    expect(mapSection).toContain("effectiveIsPeaks");

    const sw = readFile("public/sw.js");
    expect(sw).toContain('response.type !== "opaque" && !response.ok');
  });

  it("AppTabsShell precarga SocialTab/RankingTab sin fallback en blanco e inicializa modo y caché síncronamente", () => {
    const shell = readFile("components/app-tabs-shell.tsx");
    expect(shell).toContain("loadSocialTab");
    expect(shell).toContain("loadRankingTab");
    expect(shell).not.toContain('minHeight: "100vh", background: "var(--paper)"');

    const social = readFile("components/social-tab.tsx");
    expect(social).toMatch(/useState<"countries" \| "peaks">\([\s\S]*?controlledMode === "peaks"/);

    const ranking = readFile("components/ranking-tab.tsx");
    expect(ranking).toMatch(/useState<ModeFilter>\([\s\S]*?controlledMode === "peaks"/);

    const rankingHook = readFile("hooks/use-ranking-data.ts");
    expect(rankingHook).toMatch(/useState<RankingEntry\[\]>\([\s\S]*?globalRankingCache\[cacheKey\]/);
    expect(rankingHook).toMatch(/useState<boolean>\([\s\S]*?globalRankingCache\[cacheKey\]/);
  });

  it("StatsModal propaga onSwitchMode sin rebotar al modo anterior y AppTabsShell preserva #estadisticas", () => {
    const statsModal = readFile("components/stats-modal.tsx");
    expect(statsModal).toContain("prevInitialModeRef");
    expect(statsModal).toContain("if (initialMode === prevInitialModeRef.current) return;");

    const tracker = readFile("components/summit-tracker.tsx");
    expect(tracker).toContain("prevInitialModePropRef");
    expect(tracker).toContain("prevControlledExperiencesRef");
    expect(tracker).toMatch(/onModeChange=\{\(newMode\)[\s\S]*?onSwitchMode\?\.\("peaks"\)/);
    expect(tracker).toMatch(/onModeChange=\{\(newMode\)[\s\S]*?onSwitchMode\?\.\("countries"\)/);

    const social = readFile("components/social-tab.tsx");
    expect(social).toContain("prevControlledModeRef");
    expect(social).toMatch(/onModeChange=\{\(mode\)[\s\S]*?onSwitchMode\?\.\("peaks"\)/);
    expect(social).toMatch(/onModeChange=\{\(mode\)[\s\S]*?onSwitchMode\?\.\("countries"\)/);

    const ranking = readFile("components/ranking-tab.tsx");
    expect(ranking).toContain("prevControlledModeRef");
    expect(ranking).toMatch(/onModeChange=\{\(newMode\)[\s\S]*?onSwitchMode\?\.\("peaks"\)/);
    expect(ranking).toMatch(/onModeChange=\{\(newMode\)[\s\S]*?onSwitchMode\?\.\("countries"\)/);

    const shell = readFile("components/app-tabs-shell.tsx");
    expect(shell).toContain("isStatsHash");
    expect(shell).toContain("closingStatsOnSameTab");
    expect(shell).toContain("`${newPath}${statsHash}`");
    expect(shell).toContain("url.hash = statsHash;");
  });
});
