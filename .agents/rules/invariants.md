---
trigger: model_decision
description: Invariantes críticas de UI, feed, fechas, proporciones de picos/experiencias, autenticación, ranking, social, enlaces, perfiles de testeo, fotos y navegación
---

# Invariantes Críticas de UI, Feed, Auth y Ranking (Anti-Regresiones)

> ⚠️ **REGLA SUPREMA DE INVARIANTES**: Toda regla documentada en las invariantes (elementos eliminados, jerarquías, estructuras y comportamientos) es **ESTRICTAMENTE VINCULANTE Y NO NEGOCIABLE**. Está **TERMINANTEMENTE PROHIBIDO** modificar, relajar, contradecir o reintroducir elementos eliminados sin el consentimiento previo y explícito del usuario.

> Para invariantes de **mapas Leaflet, renderizado vectorial, bloqueo de scroll en modales/pestañas, PWA, iconos y carga perezosa/cachés**, ver [`.agents/rules/invariants-maps-pwa.md`](./invariants-maps-pwa.md).

---

## 1. Fechas y Estructura en Feed (`components/feed-tab.tsx`)

1. **Ubicación de la Fecha**: La fecha de la actividad (o rango de fechas) **NUNCA** se renderiza en el título de la tarjeta (`displayTitle`), **SIEMPRE** en el subtítulo bajo el usuario (`feed-card-header`).
2. **Título Limpio**: El título (`feed-record-title`) contiene exclusivamente el nombre de la cumbre, país o experiencia (`finalLocationName`), sin añadidos ni concatenaciones de fechas.
3. **Formato de Fecha en Subtítulo**:
   - Fecha única: `${startStr}` (ej. `12 ago 2024`) o fallback de tiempo relativo (`formatDateSafe`).
   - Rango: `${startStr} - ${endStr}` (ej. `12 ago 2024 - 15 ago 2024`).
4. **Deep-linking en Título**: El título `<h3 className="feed-record-title">` enlaza con `#panel=${recordId}`:
   - Picos: `?challenge=peaks#panel=peakId`
   - Países: `?challenge=countries#panel=countryId`
   - Experiencias: `?challenge=experiences#panel=experienceId` (o `${expId}::${subItemId}`)
5. **Botón Compartir en Publicaciones (`feed-share-btn`)**: Cada tarjeta del feed y panel de actividad debe incluir un botón de compartir (`feed-share-btn`) con deep-link a `#panel=${recordId}`, soportando Web Share API (`navigator.share`) y fallback al portapapeles con feedback "¡Copiado!". **Exclusión de enlaces externos del usuario**: al compartir, no se incluyen enlaces introducidos por el usuario (campos `link`, `link_2` o URLs en notas) para que la URL de Atlas sea el único enlace y WhatsApp/redes muestren siempre el banner con las fotos.
6. **Sin Botones de Reacciones**: Las tarjetas del feed no incluyen botones ni contadores de like, dislike o comentarios.

---

## 2. Conteos y Proporciones (Picos y Experiencias)

1. **Regla de los 47 Picos (`components/social-tab.tsx`, `components/summit-tracker.tsx`)**:
   - España tiene 52 demarcaciones provinciales (`peaks.ts`), pero exactamente **47 cumbres físicas únicas** (compartidas: Gorbea, Torre Cerredo, Peñalara, Peña Trevinca y Moncayo).
   - El total de picos posibles **SIEMPRE** es `47` (no 52).
   - El progreso completado se calcula por **nombres de cumbre únicos**, jamás por identificador de provincia:
     ```ts
     const uniquePeakNames = new Set(
       ascData.map(a => peaks.find(p => p.id === a.summit_id)?.name).filter(Boolean)
     );
     const pCount = uniquePeakNames.size; // Siempre sobre 47
     ```
2. **Total de Experiencias Predefinidas**:
   - `cachedTotalCounts.experiences` **NUNCA** debe inicializarse en `0`; inicializar siempre con `predefinedCategories.reduce((acc, cat) => acc + cat.experiences.length, 0)`.
3. **Completitud de Experiencias con Sub-items**:
   - Una experiencia **sin sub-items** se completa con 1 registro.
   - Una experiencia **con sub-items** (ej. Big Five, 7 Maravillas) **SÓLO** se computa completada cuando **TODOS** sus sub-items están registrados: `subItemIds.every((id: string) => completedSubItems.has(id))`.
4. **Sincronización Custom/Ocultos**: Tanto `social-tab.tsx` como `summit-tracker.tsx` deben sincronizar con `custom_experiences`, `custom_experience_categories` y `hidden_items` para mostrar totales idénticos.
5. **Inmutabilidad de Categorías por Defecto**: Las categorías predefinidas (`predefinedCategories`) son estrictamente inmutables en nombre e icono. Solo las categorías personalizadas creadas por el usuario (`isCustomCat`) muestran el botón de edición. Para las categorías por defecto únicamente aparece el icono de la cruz para enviarlas a la papelera (`hidden_items`).

---

## 3. Autenticación y Ciclo de Vida de Sesión (`components/auth-context.tsx`)

1. **Sin Deslogueos Prematuros**:
   - `localStorage.removeItem("app_user_profile")` y `profile = null` **SÓLO** se invocan ante evento explícito `event === "SIGNED_OUT"` o llamada a `signOut()`.
   - Montaje inicial o estados transitorios de sesión nula **NUNCA** deben purgar el perfil en disco o memoria.
2. **Caché en Memoria (`RootLayout`)**:
   - `globalSession` y `globalProfile` persisten a nivel de módulo entre navegaciones de ruta en cliente.
   - Evitar re-fetch del perfil si `globalProfile.id === nextSession.user.id`.

---

## 4. Ranking y Estabilidad de Scroll (`components/ranking.css`, `styles/base.css`, `components/ranking-tab.tsx`)

1. **Contenedor Inmutable**: Anchos de columnas fijos independientemente de filtros o longitud de textos.
2. **Anillos del Podio Top-3**: Los avatares con contorno (`outline: 2px solid ...; outline-offset: 2px;`) deben conservar `margin: 4px;` en `.ranking-avatar` para no ser recortados.
3. **Gutter Estable**: `html, body` deben conservar `scrollbar-gutter: stable;` para evitar desplazamientos horizontales al cambiar de pestaña.
4. **Cómputo Estricto de Participantes en Ranking**: El número de exploradores/escaladores contabiliza **ÚNICAMENTE** a usuarios que hayan registrado al menos un elemento (`ascents_count > 0` en países o cumbres físicas). En ningún caso debe tomarse el conteo total de la tabla `profiles`.
5. **Posición de la Lupa (Buscador del Mapa)**: La lupa (`.map-search-control`) se sitúa en su posición superior estándar (`top: 10px; right: 10px;` en desktop, `top: 8px; right: 8px;` en móvil) tanto en el mapa normal como en el mapa colectivo. **ÚNICAMENTE** se desplaza hacia abajo (`.map-search-control--offset`, `top: 48px;` / `top: 44px;`) cuando se accede al perfil de otro usuario y aparece el botón de comparar (`isReadOnly && session`).
6. **Estabilidad Cromática de «Comparar conmigo» al Cambiar a Experiencias**: El botón flotante `.map-floating-btn` no cambia de color al conmutar a `.mode-experiences`, manteniendo invariables sus colores de fondo blanco, texto y acentos tanto en reposo como en hover y activo (`diffMode`).
7. **Alineación Exacta de Controles con Pestaña Social y Mapa**: La barra de búsqueda, la píldora de «Siguiendo» y el selector de experiencias (`.social-feed-controls`) en `RankingTab` y `SocialTab` comparten la misma estructura de contenedores (`.page-container` con `paddingTop: '14px'`, `paddingBottom: '70px'`, `paddingLeft: '16px'`, `paddingRight: '16px'` y contenedor interno con `maxWidth: '680px', margin: '0 auto', width: '100%'`, reduciéndose a `padding-top: 8px !important` en móvil `<= 768px`), garantizando posición idéntica a `.map-section` al alternar entre pestañas.
8. **Leyenda Comparativa (Centrada en Móvil e Invarianza Cromática en Modo Oscuro)**: `.diff-legend` ('Solo tú', 'Solo @usuario', 'Ambos', 'Ninguno') se centra horizontalmente en móvil (`<= 768px`) conservando todos sus elementos incluido 'Ninguno'. Sus colores son estrictamente invariables en `.mode-experiences`: 'Solo tú' `#7b52ab`, 'Solo @usuario' `#c75a3a`, 'Ambos' `#c5b3da`, 'Ninguno' `#ddd8d0`, sin variables de acento ni transparencias.

---

## 5. Enlaces en Registros y Feed (`components/summit-tracker.tsx`, `components/feed-tab.tsx`)

1. **Visibilidad de Enlaces**: Cuando un ascenso, visita o experiencia cuenta con hipervínculo (`link` o `link_2`), debe renderizarse con `RecordLinkBadge` tanto en el feed social como en las tarjetas del panel lateral (`.completed-card`).
2. **Protocolo Seguro**: Todo hipervínculo debe normalizarse garantizando prefijo `http://` o `https://`.
3. **Segundo Enlace y Experiencia Sutil**: Se permiten hasta 2 enlaces (`link`, `link_2`). La opción para añadir un segundo enlace solo aparece cuando el primer enlace ha sido cumplimentado, sin línea divisoria superior punteada.
4. **Icono Dinámico (`Footprints`) y Placeholders por Modalidad**: Enlaces a plataformas outdoor/running (Strava, Wikiloc, Komoot, AllTrails, Garmin, Outdooractive, Relive, etc.) muestran el icono `Footprints`. Placeholders dinámicos:
   - Picos: 1º `"Ej: Track de la Ruta"`, 2º `"Ej: Equipamiento utilizado"`.
   - Países: 1º `"Ej: Restaurante favorito"`, 2º `"Ej: Alojamiento recomendado"`.
   - Experiencias: 1º `"Ej: Vídeo de la experiencia"`, 2º `"Ej: Guía para la experiencia"`.
5. **Compactación y Límite de Fotos en Diálogo de Registro**: En el diálogo de registro de países no se muestra el continente bajo el título (conservándose en el panel informativo lateral). Al alcanzar el límite de 4 fotos, `.file-dropzone` pasa a estado deshabilitado (`.file-dropzone--disabled`, `opacity: 0.45`, `cursor: not-allowed`).

---

## 6. Aislamiento y Sigilo de Perfiles de Testeo (`is_test: true`)

1. **Invisibilidad en Ranking**: Todo perfil marcado con `is_test: true` queda **ESTRICTAMENTE EXCLUIDO** de `get_user_ranking` y del conteo de usuarios registrados.
2. **Invisibilidad en Feed Social**: Actividades de usuarios de testeo no deben aparecer en `feed-tab.tsx`.
3. **Invisibilidad en Búsqueda y Recomendaciones**: En `social-tab.tsx` / `lib/social-cache.ts`, búsquedas (`@test...`) y `get_recommended_profiles` deben filtrar `.neq('is_test', true)`.
4. **Protección RLS y Vista de Perfil**: Políticas RLS en Supabase y `ProfileView` impiden el acceso a perfiles de prueba por otros usuarios.
5. **Bucle de Ejecución de Tests Profundos**: `tests/deep/full-user-lifecycle.test.ts` se ejecuta exclusivamente en `npm run verify` o `npm run test:deep`, excluido de `npm run verify:fast`.

---

## 7. Botón de Cuenta en Cabecera (`.account-button`) y Modalidades

1. **Solo Foto o Inicial en Cabecera Superior**: En `components/layout/app-topbar.tsx` (usado por `summit-tracker.tsx`, `ranking-tab.tsx` y `social-tab.tsx`), arriba a la derecha (`.account-button`) solo debe aparecer el avatar circular (foto de perfil o inicial `?` / letra inicial), **NUNCA** el correo electrónico ni el nombre de usuario.
2. **Jerarquía de Modalidades**: "Modo experiencias" depende jerárquicamente del "Modo países". Si "Modo países" está desactivado (`enable_countries: false` o `canShowCountries: false`), el "Modo experiencias" queda congelado y deshabilitado en UI y ajustes.
3. **Persistencia sin Pérdida de Datos**: Desactivar una modalidad oculta vistas, botones y publicaciones, pero conserva íntegramente los datos históricos del usuario.
4. **Dimensiones del Panel de Ajustes**: El modal de ajustes de perfil (`ProfileSettings`) debe permanecer visible sin requerir scroll vertical en la vista principal.

---

## 8. Visualización de Fotos, Lightbox y Editor (`components/photo-lightbox.tsx`, `components/photo-editor.tsx`)

1. **Sin Fechas en Fotos**: En ningún caso deben mostrarse fechas como subtítulo o pie de foto (ni en cuadrículas de fotos ni en el lightbox).
2. **Descripción de Fotos**: Si una foto tiene `caption`, se muestra en `figcaption`. Si no tiene descripción, no se renderiza texto ni fecha de fallback.
3. **Visor de Foto (Lightbox - `PhotoLightbox`)**:
   - Muestra el título del lugar o experiencia y, si existe, la descripción personalizada, pero jamás la fecha.
   - **Fondo Negro y No Fragilidad**: Fondo negro puro (`#000000`). Tocar o hacer clic fuera de la foto **no** cierra el visor; el cierre es exclusivo mediante botón `X`, `Escape` o navegación Atrás del historial.
   - **Cero Solapamiento**: `.lightbox-stage` y `.lightbox-footer` son contenedores flex independientes en columna para que la imagen nunca tape el título ni el pie de foto.
   - **Zoom y Pan**: Soporta rueda de ratón, doble clic/tap, pinch-to-zoom, controles visuales y arrastre (pan) con zoom activo.
4. **Editor de Fotos en Móvil (`components/photo-editor.tsx`)**: Los botones de la barra inferior (*"Rotar"*, *"Espejo H"*, *"Espejo V"*, *"Restablecer"*) deben mostrarse estrictamente en una única línea (`white-space: nowrap;`) sin saltos de línea ni desbordamiento en móvil (`<= 768px`).

---

## 9. Pantalla de Carga y Modales de Seguridad (`app/loading.tsx`, `components/delete-account-modal.tsx`)

1. **Pantalla de Carga sin Abusos (`app/loading.tsx`)**: Al navegar entre pestañas cacheadas (Mapa, Social, Ranking) no debe parpadear la pantalla de carga; requiere debounce `>= 700ms`.
2. **Aislamiento en Modal de Eliminar Cuenta (`delete-account-modal.tsx`)**: Aislado del backdrop padre (`ProfileSettings`), deteniendo la propagación (`onClick`, `onMouseDown`, `onKeyDown` con `stopPropagation()`) para que clicar o escribir en el campo de confirmación no cierre el diálogo.

---

## 10. Textos Simplificados y Estructura en Portada (`components/summit-tracker.tsx`, `styles/hero.css`)

1. **Eliminación de Subtítulos y Eyebrows**:
   - Eliminados eyebrows de Hero (*"UN RETO, 47 PICOS"*, *"UN RETO, 196 PAÍSES"*, *"UN RETO, EXPERIENCIAS GLOBALES"*), *"EL RETO COMPLETO"*, *"TU PROGRESO"* y subtítulos explicativos de Hero/Mapa.
   - En experiencias, el lema unificado es *"Márcalo en tu mapa."*.
   - Suprimido el símbolo decorativo de fondo (`mountain-art`) y la banda intermedia `.challenge-summary`.
2. **Ocultación Estricta de Lemas en Móvil y Tableta (`<= 1023px`)**: `hero-title-wrap--motto` (`hide-on-mobile`) está oculto (`display: none !important;`) en `<= 1023px`, mostrando solo el ratio numérico y la barra de progreso. El selector de modalidad (`.app-mode-switch`) reside únicamente en `.topbar`, siempre oculto dentro de `.hero`.
3. **Bandas del Hero Más Estrechas**: Padding vertical reducido a 24px (escritorio) y 18–20px (tablet/móvil) con `margin: 0` en `h1`.
4. **Eliminación de Cabeceras de Listado y Alineación de Búsqueda**: Se suprimen títulos/subtítulos de cabecera en el listado en todas las modalidades. `.peak-list-controls` agrupa `.list-filters` a la izquierda y `.search-input-container` a la derecha (`align-items: center`, `margin-left: auto` en `> 768px`; apilado arriba a ancho completo con `order: -1` en `<= 768px`).

---

## 11. Navegación y Desplazamiento a la Vista de Mapa (`components/layout/app-topbar.tsx`, `components/summit-tracker.tsx`)

1. **Cabecera Fija (`position: sticky`)**: `.topbar` conserva siempre `position: sticky; top: 0; z-index: 20;` con `.app-mode-switch` centrado absolutamente sin degradar la cabecera a `position: relative`.
2. **Comportamiento del Enlace «Mapa»**:
   - Desde otras pestañas: navega normalmente a `/` o `/picos` desde arriba sin scroll forzado.
   - Estando ya en la página principal: ejecuta `scrollToMap` alineando `#mapa` justo debajo de la cabecera fija.
   - Pulsar el logotipo «Atlas» (`brand`) desplaza suavemente a `scrollY: 0`.

---

## 12. Píldora de Búsqueda, Filtro de Siguiendo, Experiencias y Franja Vertebral en Social (`components/social-tab.tsx`, `components/feed-tab.tsx`)

1. **Controles en Social**:
   - Barra `.social-feed-controls` alineada a `max-width: 680px; margin: 0 auto;` en desktop.
   - `.social-search-box` usa placeholders concisos (`"Usuario, picos, fecha..."`, `"Usuario, país, fecha..."`, `"Usuario, experiencia, fecha..."`), oculta `::-webkit-search-cancel-button` y mantiene `.social-search-clear`.
   - Botón «Siguiendo» (`.social-following-btn` con `UserRoundCheck`) agrupado a la izquierda en `.social-feed-controls-left`.
   - Alternancia de experiencias (`.diff-toggle-wrap`) a la derecha: al activarse cambia Social y Feed a tema oscuro (`.mode-experiences`) y filtra estrictamente a solo experiencias (al desactivarse, solo países).
2. **Alineación Vertical del Perfil e Inmovilidad en Móvil**: `.hero-profile-wrap` con `margin-top: 4px; margin-bottom: 0;`. En móvil (`<= 700px`), `.hero-main--social` usa cuadrícula fija `grid-template-columns: 1fr 1fr; max-width: 380px; margin: 0 auto;` con `padding-left: 6px` en perfil para evitar saltos al cambiar de modalidad.
3. **Precarga y Persistencia de Conexiones Sociales**: `preloadSocialConnections` (`lib/social-cache.ts`) y `getInitialSocialData` persisten en `localStorage` (`app_social_data_${userId}`) erradicando el parpadeo inicial `"0 seguidores • 0 siguiendo"`.

---

## 13. Botón Central de Seguir en Perfil Ajeno (`components/summit-tracker.tsx`, `styles/hero.css`)

1. **Estados**:
   - No seguido: `UserRoundPlus` + `"Seguir"`.
   - Siguiendo (reposo): `UserRoundCheck` + `"Siguiendo"`.
   - Siguiendo (hover): `UserRoundMinus` con estilo rojo de alerta (`#e53e3e`).
   - Solicitud pendiente (usuario privado): `UserRoundArrowLeft` + `"pendiente"`.
2. **Disposición**: `.hero-target-follow-center` organiza en columna botón circular y etiqueta centrados entre título y estadísticas.
