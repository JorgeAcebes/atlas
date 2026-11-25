# 47 Picos & 196 Países (Atlas) · Contexto Persistente para Agentes

> Aplicación web social y cartográfica para registrar el ascenso al techo provincial de las 50 provincias españolas más Ceuta y Melilla (52 demarcaciones, 47 cumbres físicas), el recorrido por 196 países del mundo y experiencias de aventura personalizadas.
> Stack: Next.js 15 (App Router), React 19, TypeScript, Leaflet, Supabase (Auth, Postgres RLS), Cloudflare R2, Web Push (VAPID), REST API v1 y servidor MCP.

---

## 1. Comandos Canónicos de Desarrollo y Verificación

| Acción | Comando | Notas |
| :--- | :--- | :--- |
| **Instalar dependencias** | `npm install` | Requiere Node >= 20 |
| **Servidor de desarrollo** | `npm run dev` | Puerto 3000 por defecto |
| **Compilación de producción** | `npm run build` | Valida rutas estáticas y bundles |
| **Linter de código** | `npm run lint` | ESLint 9 |
| **Suite de pruebas** | `npm test` | Vitest (unitarias e integración) |
| **Pruebas E2E profundas** | `npm run test:deep` | `tests/deep/` (ejecutado en `verify`) |
| **Bucle rápido (Inner Loop)** | `npm run verify:fast` | Ficheros + Tipos + Vitest (~10s). Usar en cada iteración. |
| **Verificación completa (Pre-Push)** | `npm run verify` | Ficheros + Tipos + Lint + Tests + Deep + Build (~60s). Solo al entregar o hacer push. |
| **Evaluador de benchmarks** | `npm run harness:eval` | Valida contratos clave en `.agents/eval/` |

---

## 2. Protocolo de Verificación y Criterio de «Terminado»

- **Inner Loop (`npm run verify:fast` o `npm test`)**: Comando predeterminado durante el desarrollo iterativo, refactors y corrección de bugs.
- **Outer Loop (`npm run verify`)**: Ejecutar únicamente cuando el usuario solicite explícitamente entrega final, commit de cierre o push.

Una tarea sólo se considera concluida cuando:
1. `npm run verify` finaliza con código de salida `0` en la entrega o push.
2. No se modifican las migraciones congeladas de Supabase (`001` a `021`).
3. El árbol de trabajo queda limpio, sin ficheros temporales ni secretos expuestos.

---

## 3. Estructura del Proyecto

```text
├── .agents/              # Config de agentes: rules/, skills/, eval/
├── app/                  # Next.js 15 App Router, layouts, APIs (/api/photos/*, /api/v1/*, /api/mcp, /api/push/*, /api/keepalive)
├── components/           # Componentes UI modulares: tracker/, stats/, feed/, social/, ranking/, maps/, layout/, shared/
├── data/                 # Datasets estáticos: peaks.ts (52/47), countries.ts (196), experiences.ts
├── docs/                 # Documentación: architecture.md, decisions/ (ADR), plans/
├── hooks/                # Custom hooks compartidos (use-ranking-data, use-social-connections, use-pwa-install, etc.)
├── lib/                  # Clientes, cachés, R2, seguridad de fotos, Leaflet patch, servicio Atlas y MCP
├── public/               # Cartografía TopoJSON optimizada, iconos PWA y Service Worker (sw.js)
├── scripts/              # verify.mjs, verify.sh, protect-files.mjs, generación de iconos y TopoJSON
├── styles/               # Hojas CSS modulares importadas por app/globals.css (tokens, base, navigation, hero, maps, etc.)
├── supabase/migrations/  # Migraciones SQL contiguas (001–036+; 001–021 congeladas) con RLS obligatorio
└── tests/                # Suites Vitest (unit, integration, deep), source-reader y mocks (@/tests/mocks)
```

---

## 4. Resumen de Invariantes Críticas (No Regresiones)

> ⚠️ **REGLA SUPREMA**: Todas las invariantes de producto, diseño, mapas y seguridad son estrictamente vinculantes. No modifiques, relajes ni reintroduzcas elementos eliminados sin consentimiento explícito del usuario. Las especificaciones completas residen en [`.agents/rules/invariants.md`](./.agents/rules/invariants.md) y [`.agents/rules/invariants-maps-pwa.md`](./.agents/rules/invariants-maps-pwa.md), y su cumplimiento se verifica en [`tests/integration/invariants.test.ts`](./tests/integration/invariants.test.ts).

- **Picos (47 vs 52) y Experiencias**: 52 demarcaciones provinciales representan **47 cumbres físicas únicas** (5 compartidas: Gorbea, Torre Cerredo, Peñalara, Peña Trevinca, Moncayo). Contabilizar siempre por nombre único (`uniquePeakNames.size`). Una experiencia con sub-items sólo cuenta como completada si todos sus sub-items están marcados; las categorías predefinidas son inmutables.
- **Feed y Enlaces**: Título limpio (`displayTitle = finalLocationName`) enlazando a `#panel=recordId`; fecha en cabecera (`feed-card-header`), nunca en título ni en fotos/lightbox; botón compartir (`feed-share-btn`) excluyendo enlaces del usuario (`link`/`link_2`/URLs); sin botones de like/dislike/comentarios.
- **Autenticación y Testeo (`is_test`)**: Purgar sesión/perfil únicamente ante `SIGNED_OUT` o `signOut()`. Perfiles con `is_test: true` invisibles en ranking, feed, búsqueda y recomendaciones.
- **Cabecera, Modalidades y Ranking**: `.account-button` muestra solo avatar/inicial (nunca email ni username); `.topbar` siempre `position: sticky`; Modo Experiencias depende estrictamente de Modo Países; Ranking contabiliza únicamente usuarios con `ascents_count > 0`; la lupa (`.map-search-control`) solo se desplaza hacia abajo con `--offset` en perfil ajeno con botón de comparar; controles alineados a `maxWidth: 680px`.
- **Mapas Leaflet y SSR**: Cargar siempre con `dynamic(..., { ssr: false })`; cada mapa usa su propia instancia `createAdaptiveCanvasRenderer` (sin mutar `L.Canvas.prototype`), declara `center` y `zoom` en `<MapContainer>`, usa `animate: false` en el primer `fitBounds`, valida límites de España contra Zero-Island `(0,0)` y suspende `_onCanvasMove` durante el zoom.
- **Visor/Editor de Fotos, Modales y PWA**: Lightbox negro (`#000000`) sin fechas ni cierre al clic exterior; botones del editor en una línea (`white-space: nowrap`); bloqueo de scroll en modales (`useScrollLock`); debounce `>= 700ms` en `app/loading.tsx`; `favicon.ico` nunca declara `sizes: "any"`; iconos PWA/maskable con proporciones y fondo canónicos; aislamiento de scroll entre pestañas.

---

## 5. Reglas Críticas de Seguridad y Base de Datos

1. **Inmutabilidad de Migraciones**: Las migraciones `001_` a `021_` **nunca se editan**. Cualquier cambio de esquema requiere una nueva migración correlativa (siguiente: `037_<nombre>.sql`), idempotente y con `ENABLE ROW LEVEL SECURITY`.
2. **Secretos Protegidos**: Los ficheros `.env*` nunca se commitean ni se exponen al cliente. Las variables accesibles en navegador deben llevar el prefijo `NEXT_PUBLIC_`.
3. **Mocks en Pruebas**: Nunca conectar a Supabase real en tests unitarios; usar `@/tests/mocks/supabase-mock`.

---

## 6. Documentación y Skills Bajo Demanda

- Arquitectura del sistema: [`docs/architecture.md`](./docs/architecture.md)
- Decisiones de arquitectura (ADR): [`docs/decisions/`](./docs/decisions/)
- Plantilla de planes largos: [`docs/plans/template.md`](./docs/plans/template.md)
- Skills de dominio y flujos: [`.agents/skills/`](./.agents/skills/)
