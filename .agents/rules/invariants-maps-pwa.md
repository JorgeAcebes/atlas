---
trigger: model_decision
description: Invariantes críticas de mapas Leaflet, renderizado vectorial Canvas, selección de experiencias, bloqueo de scroll en modales/pestañas, PWA, iconos y carga perezosa
---

# Invariantes Críticas de Mapas, Scroll, PWA y Rendimiento (Anti-Regresiones)

> ⚠️ **REGLA SUPREMA DE INVARIANTES**: Toda regla documentada en las invariantes es **ESTRICTAMENTE VINCULANTE Y NO NEGOCIABLE**. Está **TERMINANTEMENTE PROHIBIDO** modificar, relajar, contradecir o reintroducir elementos eliminados sin consentimiento previo y explícito del usuario.

> Para invariantes de **UI, feed, conteos, autenticación, ranking, social, enlaces, fotos y navegación**, ver [`.agents/rules/invariants.md`](./invariants.md).

---

## 1. Mapas Leaflet e Hidratación SSR

1. **Sin SSR en Mapas**: `spain-map.tsx`, `world-map.tsx` y `collective-map.tsx` dependen de `window`: cargar siempre con:
   ```tsx
   dynamic(() => import("@/components/..."), { ssr: false })
   ```
2. **Protección de Hidratación en UI (`components/summit-tracker.tsx`)**: Proteger selectores condicionales dependientes de perfil (`enable_experiences`) con estado `mounted` (`useEffect(() => setMounted(true), [])`).
3. **Blindaje de Canvas Vectorial, Cero-Island y Bloqueo Táctil (`world-map.tsx`, `collective-map.tsx`, `spain-map.tsx`, `lib/leaflet-canvas-patch.ts`)**:
   - **Instancia Adaptativa de Renderer (`createAdaptiveCanvasRenderer`)**: Cada mapa instancia su propio renderizador Canvas pasado explícitamente a `<MapContainer renderer={canvasRenderer}>`, sin mutar nunca `L.Canvas.prototype.options.padding`. Usa `padding: 0.5` en escritorio HiDPI, y `1.0` (mundial/colectivo) o `0.8` (España) en móvil/tableta, junto con `getAdaptiveKeepBuffer()` (`3` escritorio / `4` táctil).
   - **Coordenadas Iniciales Obligatorias en `<MapContainer>`**: Todo `<MapContainer>` debe declarar `center` y `zoom` iniciales (`center={[20, 0]} zoom={2}` mundial, `center={[40.4168, -3.7038]} zoom={5}` España, condicional en colectivo).
   - **`animate: false` en Encuadre Inicial y Protección Zero-Island (`FitWorld`, `FitSpain`, `MapActiveSynchronizer`, `MapZoomListener`)**: El primer `map.fitBounds` se ejecuta con `{ animate: false }`. En España (`kind="spain"`), `MapActiveSynchronizer` y `mapState_spain` validan los límites de España al reactivar la pestaña para impedir saltos a `(0, 0)`.
   - **Protección de `MapInvalidator` en Montaje**: Invalida una sola vez de forma directa en montaje/activación (`map.invalidateSize({ animate: false, pan: false })`), reservando el bucle RAF de 350ms exclusivamente para cambios de `panelOpen`.
   - **Suspensión de Repintado Dinámico en Zoom (`_atlasMovePatched`)**: `ensureLeafletCanvasPatched()` suspende `_onCanvasMove` durante cualquier gesto o animación de zoom (`_isZooming`, `_animatingZoom`, `touchZoom._zooming`, `zoomstart`/`zoomend`, o `!(this._map.dragging && this._map.dragging.moving())`), cancelando RAFs pendientes en `zoomstart` y forzando `this._update()` al concluir `zoomend`.
   - **Trazado y Prevención Pasiva de Zoom UI**: `L.Polyline.prototype.options.smoothFactor = 1.2`. `components/pwa-zoom-lock.tsx` + `styles/maps.css` bloquean zoom accidental de UI con `touch-action` pasivo y listeners WebKit (`gesturestart`/`gesturechange`), sin interceptar `touchstart`/`touchmove` globales sobre los mapas.

---

## 2. Modo Experiencias y Selección en Mapa (`components/world-map.tsx`, `components/summit-tracker.tsx`)

1. **Visibilidad Estricta de Marcadores**: Los marcadores de experiencias en `WorldMap` NUNCA deben renderizarse si `experiencesMode` es falso (`if (!experiencesMode || !experienceRecords.length) return [];`). Ocultar por CSS es insuficiente por los hitboxes de Leaflet.
2. **Cierre de Registro al Desactivar Modo Experiencias**: Al desactivar el modo experiencias, si está abierto un registro/panel de experiencia (`isSelectedExp`), debe cerrarse (`closePanel()`) y purgar `#panel=` de la URL. Si el elemento abierto es un país, permanece abierto.
3. **Ocultación del Botón de Círculos Concéntricos al Situar Ubicación**: Mientras `selectingLocation` / `selectingLocationForExp` esté activo (aviso *"Haz clic en el mapa para situar la experiencia o busca el lugar aquí"*), el botón flotante `Añadir experiencia en el mapa` está estrictamente oculto (`!selectingLocation && !selectingLocationForExp`).
4. **Fijación de Pantalla y Cruz de Cancelación (`X`)**: Durante la selección de ubicación de una experiencia, `isScrollLocked` bloquea el scroll exterior. En móvil (`<= 768px`), la vista se coloca en `top: 0` (`behavior: "instant"`); en escritorio, se alinea a `#mapa` bajo la cabecera fija. El mapa mantiene zoom/pan plenos y el banner superior incluye `.selecting-location-cancel-btn` (`X` o `Escape`) para cancelar limpiamente.

---

## 3. Experiencia y Layout en Mapa Colectivo (`components/collective-map.tsx`, `components/ranking.css`)

1. **Pop-up de Visitantes Abajo a la Derecha**: `.collective-visitors-panel` se sitúa abajo a la derecha (`bottom: 24px; right: 24px;` en desktop, hoja inferior en móvil), sin tapar `.map-search-control` ni `ExperiencesToggleControl`.
2. **Botón Unificado y Sincronizado de «Siguiendo»**: Usa `.social-following-btn` con `UserRoundCheck` (sin píldoras duales Global/Siguiendo), sincronizado bidireccionalmente (`scope` / `onScopeChange`) entre `RankingTab` y `CollectiveMap`.
3. **Tipografía Canónica y Disponibilidad Dual**: Encabezados con `var(--font-display)` (`Playfair Display`), interfaz con `var(--font-sans)` (`DM Sans`). Disponible tanto para 196 Países como para 47 Picos (`#5c9b7d` para 3+, `#bcd4c8` para 2, `#c75a3a` para 1, neutro para 0).

---

## 4. Bloqueo de Scroll en Modales y Aislamiento entre Pestañas

1. **Bloqueo Estricto de Scroll de Fondo (`lib/scroll-lock.ts`)**: Al abrir `expSelectorOpen`, `showTrashModal`, `editingCustomCategory`, `selectingCategoryForNewExp`, `editingCustomExp`, `confirmAction`, `assignToRecordModalOpen` o `ProfileSettings`, se activa `isScrollLocked` / `lockScroll()` (`overflow: hidden` en `documentElement` y `body`), deteniendo `wheel` en `.modal-backdrop` (`stopPropagation()`) y usando `overscrollBehavior: "contain"`.
2. **Cero Permeabilidad de Scroll entre Pestañas (`components/app-tabs-shell.tsx`)**:
   - Al navegar a una pestaña/ruta distinta por clic, la nueva vista inicia en `top: 0` (`behavior: "instant"`).
   - En `AppTabsShellInner`, `window.history.scrollRestoration = "manual"` restaura posiciones solo en eventos `popstate` (atrás/adelante).
   - Al clicar la pestaña ya activa, desplaza suavemente a `top: 0` (`behavior: "smooth"`).

---

## 5. Iconos, Logo y Configuración PWA (`app/layout.tsx`, `components/install-prompt.tsx`, `public/manifest.json`, `scripts/generate-icons.js`)

1. **Logo Transparente y Tamaños**:
   - `app/icon.svg`, `public/icon-192.svg`, `public/icon-512.svg` y `public/icon-1024.svg` no incluyen `<rect>` de fondo (transparencia obligatoria); `app/icon.svg` usa `viewBox="0 0 56 56"` sin `scale(0.7)`.
   - Iconos raster PWA (`icon-192.png`, `icon-512.png`, `icon-1024.png`, `apple-touch-icon.png`) y maskable (`icon-maskable-*.png`) calibrados con `ratio = 0.375` en `scripts/generate-icons.js`, con fondo sólido en maskable y `apple-touch-icon.png`.
2. **Splash Screen Nítido y Prevención de Barra Fuera de Ámbito**:
   - En `app/layout.tsx`, `/favicon.ico` **JAMÁS** debe declarar `sizes: "any"`; debe usar `sizes: "16x16 32x32 48x48"`.
   - Enlazar prioritariamente `512x512` y `1024x1024` en `<head>` y manifiestos (`display: "standalone"`, `display_override: ["standalone", "window-controls-overlay"]`, `start_url: "/"`, `scope: "/"`), más metaetiquetas `mobile-web-app-capable="yes"`, `application-name="Atlas"` y redirección preventiva desde `atlas-log.vercel.app`.
3. **Ciclo de Vida de Instalación (`components/install-prompt.tsx`, `hooks/use-pwa-install.ts`)**:
   - El icono en `InstallPrompt` se renderiza estrictamente con `/icon-192.png` (prohibidos SVGs con `url(#id)` por fallo en subrutas cliente).
   - Al cerrar (`handleClose`), invoca `clearInstallPrompt()` y guarda `pwa_dismissed_session = "true"` en `sessionStorage`.
   - Tras instalar (`appinstalled` / `atlas-app-installed`), persiste `pwa_app_installed = "true"` en `localStorage` y oculta el botón de descarga mostrando estadísticas (`!canInstallMobile || targetProfile || isPwa`). Comprueba `navigator.getInstalledRelatedApps()` y nunca muestra instrucciones de tres puntos si ya está instalada.

---

## 6. Carga Perezosa de Pestañas, Precarga Regulada y Arquitectura de Activos

1. **Pestañas Inactivas Bajo Demanda + Warmup**: `AppTabsShell` monta inicialmente solo la pestaña activa (`visitedTabs`), manteniendo en memoria las visitadas (`display: none` si inactivas) y precalentando chunks con `requestIdleCallback` (`warmChunks`).
2. **Precarga y Caché Reguladas**:
   - `hooks/use-social-connections.ts`: precarga progreso/conexiones (800ms) con caché en `localStorage` (`app_social_data_${userId}`).
   - `components/feed-tab.tsx` (`lib/feed-fetcher.ts`): precarga feed (1100ms si inactiva) y usa `preloadImages(result.preloadUrls, { maxConcurrent: 3, maxCount: 9 })` con `img.decoding = "async"`.
   - `hooks/use-ranking-data.ts`: precarga ranking (1300ms) en ambas modalidades (países y picos) en `globalRankingCache`.
3. **Tipografía, CSS Modular y R2**: Fuentes autoalojadas vía `next/font/google` en `styles/tokens.css` (`--font-sans`, `--font-mono`, `--font-serif`, `--font-display`); `app/globals.css` orquesta las hojas de `styles/`; R2 usa solo env vars (`CLOUDFLARE_R2_*`), validación mágica (`lib/photo-security.ts`), proxy `/api/photos/view/[...key]` y caché SW (`atlas-photos-v13`).
