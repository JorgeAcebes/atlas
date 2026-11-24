import { describe, it, expect } from "vitest";
import { feature } from "topojson-client";
import { resolveCountryFromFeature } from "@/data/countries";
import { peakByCode } from "@/data/peaks";
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
      expect(mapSrc).toContain("wheelDebounceTime={25}");
      expect(mapSrc).toContain("inertiaDeceleration={2200}");
    }

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

describe("Animación de entrada inicial con los dos triángulos (Prioridad #100)", () => {
  it("se reproduce solo en entradas nuevas, respeta reduced-motion y no bloquea interacción", () => {
    const overlay = readFile("components/entry-intro-overlay.tsx");
    const baseCss = readFile("styles/base.css");
    const providers = readFile("components/providers.tsx");

    expect(overlay).toContain("atlas_entry_intro_shown");
    expect(overlay).toContain("(prefers-reduced-motion: reduce)");
    expect(overlay).toContain("reload");
    expect(overlay).toContain("back_forward");
    expect(overlay).toContain("M4 44 L28 4 L40 24 Z");
    expect(overlay).toContain("M16 52 L36.4 18 L52 44 Z");

    expect(baseCss).toContain(".atlas-entry-intro");
    expect(baseCss).toContain("pointer-events: none");
    expect(baseCss).toContain("@keyframes atlasTriangleLeft");
    expect(baseCss).toContain("@keyframes atlasTriangleRight");
    expect(baseCss).toContain("@keyframes atlasIntroZoomOut");

    expect(providers).toContain("<EntryIntroOverlay />");
  });
});
