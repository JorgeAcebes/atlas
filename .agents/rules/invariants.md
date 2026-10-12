---
trigger: model_decision
description: Invariantes críticas de componentes, feeds, fechas, proporciones de picos, sub-items, autenticación y ranking
---

# Invariantes Críticas de Arquitectura y Código (Anti-Regresiones)

> ⚠️ **REGLA SUPREMA DE INVARIANTES**: Toda regla documentada en las invariantes (elementos eliminados, jerarquías, estructuras y comportamientos) es **ESTRICTAMENTE VINCULANTE Y NO NEGOCIABLE**. Está **TERMINANTEMENTE PROHIBIDO** modificar, relajar, contradecir o reintroducir elementos eliminados sin el consentimiento previo y explícito del usuario.

Este documento reúne todas las reglas no negociables de la aplicación. Cualquier modificación a componentes de interfaz, navegación, contadores, autenticación o ranking **DEBE** respetar estrictamente estos patrones:

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
5. **Botón Compartir en Publicaciones (`feed-share-btn`)**: Cada tarjeta del feed debe incluir un botón de compartir (`feed-share-btn`) con deep-link a `#panel=${recordId}`, soportando Web Share API (`navigator.share`) y fallback al portapapeles con feedback "¡Copiado!".
6. **Sin Botones de Reacciones**: Las tarjetas del feed no incluyen botones ni contadores de like, dislike o comentarios.

---

## 2. Conteos y Proporciones (Picos y Experiencias)

1. **Regla de los 47 Picos (`components/social-tab.tsx`, `components/summit-tracker.tsx`)**:
   - España tiene 52 demarcaciones provinciales (`peaks.ts`), pero exactamente **47 cumbres físicas únicas**.
   - El total de picos posibles **SIEMPRE** es `47` (no 52).
   - El progreso completado se calcula por **nombres de cumbre únicos**, jamás por identificador de provincia:
     ```ts
     const uniquePeakNames = new Set(
       ascData.map(a => peaks.find(p => p.id === a.summit_id)?.name).filter(Boolean)
     );
     const pCount = uniquePeakNames.size; // Siempre sobre 47
     ```
2. **Total de Experiencias Predefinidas**:
   - `cachedTotalCounts.experiences` **NUNCA** debe inicializarse en `0`; inicializar siempre con:
     ```ts
     predefinedCategories.reduce((acc, cat) => acc + cat.experiences.length, 0)
     ```
3. **Completitud de Experiencias con Sub-items**:
   - Una experiencia **sin sub-items** se completa con 1 registro.
   - Una experiencia **con sub-items** (ej. Big Five, 7 Maravillas) **SÓLO** se computa completada cuando **TODOS** sus sub-items están registrados:
     ```ts
     subItemIds.every((id: string) => completedSubItems.has(id))
     ```
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

## 4. Mapas Leaflet e Hidratación SSR

1. **Sin SSR en Mapas**: Mapas (`spain-map.tsx`, `world-map.tsx`, `collective-map.tsx`) dependen de `window`: cargar siempre con:
   ```tsx
   dynamic(() => import("@/components/..."), { ssr: false })
   ```
2. **Protección de Hidratación en UI (`components/summit-tracker.tsx`)**:
   - Proteger los selectores condicionales dependientes de perfil (`enable_experiences`) con estado `mounted`:
     ```tsx
     const [mounted, setMounted] = useState(false);
     useEffect(() => setMounted(true), []);
     {!isPeaks && (experiencesMode || (mounted && myProfile?.enable_experiences)) && ( ... )}
     ```

---

## 5. Ranking y Estabilidad de Scroll (`components/ranking.css`, `app/globals.css`)

1. **Contenedor Inmutable**: Anchos de columnas fijos independientemente de filtros o longitud de textos.
2. **Anillos del Podio Top-3**: Los avatares con contorno (`outline: 2px solid ...; outline-offset: 2px;`) deben conservar `margin: 4px;` en `.ranking-avatar` para no ser recortados.
3. **Gutter Estable**: `html, body` deben conservar `scrollbar-gutter: stable;` para evitar desplazamientos horizontales al cambiar de pestaña.
4. **Cómputo Estricto de Participantes en Ranking**: El número de exploradores o de personas sobre las que se realiza el ranking contabiliza **ÚNICAMENTE** a usuarios que hayan registrado al menos un elemento (`ascents_count > 0` en países o cumbres físicas). Quienes no hayan registrado al menos un elemento no contabilizan ni forman parte del ranking. En ningún caso debe tomarse el conteo total de la tabla `profiles` como base del ranking.
5. **Posición de la Lupa (Buscador del Mapa)**: La lupa (`.map-search-control`) se sitúa en su posición superior estándar (`top: 10px; right: 10px;` en desktop, `top: 8px; right: 8px;` en móvil) tanto en el mapa normal como en el mapa colectivo. **ÚNICAMENTE** se desplaza hacia abajo (`.map-search-control--offset`, `top: 48px;` / `top: 44px;`) cuando se accede al perfil de otro usuario y aparece el botón de comparar (`isReadOnly && session`).
6. **Estabilidad Cromática de «Comparar conmigo» al Cambiar a Experiencias**: El botón flotante de «Comparar conmigo» (`.map-floating-btn`) no cambia de color al conmutar a modo experiencias (`.mode-experiences`), manteniendo invariables sus colores de fondo blanco, texto y acentos tanto en reposo como en hover y activo (`diffMode`).
7. **Alineación Exacta de Controles con Pestaña Social y Mapa**: La barra de búsqueda, la píldora de «Siguiendo» y el selector de experiencias (`.social-feed-controls`) en `RankingTab` y `SocialTab` comparten la misma estructura de contenedores (`.page-container` con `paddingTop: '14px'`, `paddingBottom: '70px'`, `paddingLeft: '16px'`, `paddingRight: '16px'` y contenedor interno con `maxWidth: '680px', margin: '0 auto', width: '100%'`, reduciéndose a `padding-top: 8px !important` en móvil `<= 768px`), garantizando que la posición horizontal y vertical sea idéntica a la píldora de experiencias de la página de Mapa (`.map-section` a 14px / 8px del hero) para una transición completamente fluida y sin saltos visuales al alternar entre pestañas.

---

## 6. Modo de Experiencias y Cartografía (`components/world-map.tsx`, `components/summit-tracker.tsx`)

1. **Visibilidad Estricta de Marcadores en Mapa**: Los marcadores de experiencias en el mapa mundial (`WorldMap`) NUNCA deben renderizarse si `experiencesMode` es falso (`if (experiencesMode && experienceRecords)`). Ocultar únicamente mediante CSS es insuficiente porque los hitboxes de Leaflet interceptan clics.
2. **Cierre de Registro al Desactivar Modo Experiencias**: Al pulsar el botón de alternar experiencias para desactivarlo, si el usuario tiene abierto un registro o panel de experiencia, dicho registro debe cerrarse (`closePanel()`) y purgar el hash `#panel=` de la URL. Si el elemento abierto no es una experiencia (país), debe permanecer abierto.

---

## 7. Enlaces en Registros y Feed (`components/summit-tracker.tsx`, `components/feed-tab.tsx`)

1. **Visibilidad de Enlaces en Tarjetas de Registro**: Cuando un ascenso, visita a país o experiencia cuenta con hipervínculo (`link` o `link_2`), debe renderizarse con su botón/insignia interactiva (`renderRecordLink` o `renderFeedLink`) tanto en el feed social como en las tarjetas de registro del panel lateral (`.completed-card`).
2. **Protocolo Seguro**: Todo hipervínculo debe normalizarse garantizando prefijo `http://` o `https://` para evitar rutas relativas involuntarias al navegar externamente.
3. **Segundo Enlace y Experiencia Sutil**: Los registros permiten hasta 2 enlaces (`link`, `link_2`). La opción para añadir un segundo enlace solo aparece de manera sutil cuando el texto del primer enlace ha sido cumplimentado. Ambos se visualizan de forma limpia y responsiva como insignias paralelas en el feed y en el panel de detalle.
4. **Icono Dinámico de Senderismo/Running (`Footprints`)**: Enlaces a plataformas de actividades al aire libre, rutas y running (Strava, Wikiloc, Komoot, AllTrails, Garmin, Outdooractive, Relive, etc.) muestran automáticamente el icono `Footprints` tanto en el panel de detalle como en el feed social, diferenciándose de mapas generales (`MapPin`) o redes sociales. El placeholder de segundo enlace sugiere `"Ej: Restaurante favorito"`.
5. **Compactación y Límite de Fotos en Diálogo de Registro**: En el diálogo de registro de países no se muestra el continente bajo el título para ahorrar espacio vertical (conservándose en el panel informativo lateral). El segundo enlace no tiene línea divisoria superior punteada. Al alcanzar el límite de 4 fotos, el cajón de subida (`.file-dropzone`) pasa automáticamente a estado deshabilitado y más opaco (`opacity: 0.45`, `cursor: not-allowed`, texto descriptivo de límite alcanzado e input desactivado).

---

## 8. Aislamiento y Sigilo de Perfiles de Testeo (`is_test: true`)

1. **Invisibilidad en Ranking**: Todo perfil marcado con `is_test: true` queda **ESTRICTAMENTE EXCLUIDO** de la función `get_user_ranking` (modalidades picos y países) y del conteo de usuarios registrados.
2. **Invisibilidad en Feed Social**: Las actividades (ascensos y experiencias) de usuarios de testeo no deben aparecer en `feed-tab.tsx`.
3. **Invisibilidad en Búsqueda y Recomendaciones**: En `social-tab.tsx`, las búsquedas por usuario (`@test...`) y la función `get_recommended_profiles` deben filtrar forzosamente `.neq('is_test', true)`.
4. **Protección RLS y Vista de Perfil**: Políticas de seguridad a nivel de fila (RLS en Supabase) y `ProfileView` impiden el acceso a perfiles de prueba por parte de otros usuarios.
5. **Bucle de Ejecución de Tests Profundos**: La suite profunda E2E (`tests/deep/full-user-lifecycle.test.ts`) se ejecuta exclusivamente en el pipeline pre-push (`npm run verify` o `npm run test:deep`), manteniéndose excluida del bucle rápido de desarrollo (`npm run verify:fast`).

---

## 9. Botón de Cuenta en Cabecera (`.account-button`) y Modalidades

1. **Solo Foto o Inicial en Cabecera Superior**: Arriba a la derecha (`.account-button`) en `summit-tracker.tsx`, `ranking-tab.tsx` y `social-tab.tsx`, solo debe aparecer el avatar circular (foto de perfil o inicial `?` / letra inicial). En **NINGÚN** caso debe mostrarse texto con el correo electrónico ni el nombre de usuario al lado del avatar.
2. **Jerarquía de Modalidades**: "Modo experiencias" depende jerárquicamente del "Modo países". Si "Modo países" está desactivado (`enable_countries: false` o `canShowCountries: false`), el "Modo experiencias" queda congelado y no operativo en la interfaz ni en las opciones de perfil.
3. **Persistencia sin Pérdida de Datos**: Desactivar una modalidad oculta las vistas, botones, publicaciones y registros correspondientes en UI y Feed, pero jamás destruye los datos históricos de ascensos, visitas o experiencias del usuario.
4. **Dimensiones del Panel de Ajustes**: El modal de ajustes de perfil (`ProfileSettings`) debe permanecer visible sin requerir scroll vertical en la vista principal.

---

## 10. Visualización de Fotos y Fechas (`components/summit-tracker.tsx`, `components/feed-tab.tsx`)

1. **Sin Fechas en Fotos**: En ningún caso deben mostrarse fechas como subtítulo o pie de foto (ni en las cuadrículas de fotos ni en el visor a pantalla completa/lightbox).
2. **Descripción de Fotos**: Si una foto tiene descripción (`caption`), se muestra dicha descripción (`figcaption`). Si no tiene descripción, no se renderiza texto ni fecha automática de fallback.
3. **Visor de Foto (Lightbox - `PhotoLightbox`)**:
   - Al abrir una foto en el visor, se muestra el título del lugar o experiencia y, si existe, la descripción personalizada, pero jamás la fecha del registro o de la toma de la foto.
   - **Fondo Negro y No Fragilidad**: El visor tiene fondo negro puro (`#000000`). Tocar o hacer clic fuera de la foto en el fondo **no** cierra el visor, evitando cierres accidentales. El cierre se realiza exclusivamente mediante el botón explícito de cerrar (`X`), tecla `Escape` o navegación Atrás del historial.
   - **Cero Solapamiento de Títulos e Imágenes**: El área de imagen (`.lightbox-stage`) y el área de información inferior (`.lightbox-footer`) son contenedores flex independientes en columna, de modo que la imagen nunca se sobrepone al título ni pie de foto en desktop ni móvil.
   - **Zoom y Desplazamiento (Pan)**: Soporta ampliación y exploración fluida (rueda de ratón, doble clic/tap, pellizco táctil pinch-to-zoom y controles visuales), permitiendo arrastrar (pan) la imagen cuando el zoom está activo.
4. **Editor de Fotos en Móvil (`components/photo-editor.tsx`, `app/globals.css`)**: Los botones de la barra inferior de herramientas (*"Rotar"*, *"Espejo H"*, *"Espejo V"*, *"Restablecer"*) deben mostrar su texto estrictamente en una única línea (`white-space: nowrap;`). En ningún caso (especialmente en móvil) debe haber un salto de línea entre *"Espejo"* y *"H"* o *"V"*. El espaciado (`gap`) y padding del contenedor se adaptan fluidamente al ancho móvil (`<= 768px`) para garantizar que todas las etiquetas queden completamente visibles en una sola línea sin desbordamiento.

---

## 11. Pantalla de Carga y Modales de Confirmación (`app/loading.tsx`, `components/delete-account-modal.tsx`)

1. **Pantalla de Carga sin Abusos (`app/loading.tsx`)**: Una vez abierta una página (ej. Países), los datos quedan guardados y cacheados en memoria. Al navegar entre pestañas (Mapa, Social, Ranking) no debe mostrarse la pantalla de carga para transiciones puntuales o instantáneas. La pantalla de carga completa debe disponer de un retardo (debounce de al menos 700ms) para mostrarse únicamente cuando una carga requiera un tiempo prolongado perceptible.
2. **Aislamiento en Modal de Eliminar Cuenta (`delete-account-modal.tsx`)**: El diálogo de confirmación debe aislarse completamente del backdrop padre (`ProfileSettings`) y detener la propagación de eventos (`onClick`, `onMouseDown`, `onKeyDown`). El campo de texto de confirmación no debe cerrarse al hacer clic en él ni al escribir en él.

---

## 12. Iconos y Logo de la Aplicación (`app/icon.svg`, `app/favicon.ico`, `public/icon-192.svg`, `public/icon-512.svg`, `public/apple-touch-icon.png`)

1. **Logo sin Fondo en Ventana/Pestaña**: El icono de la aplicación en la ventana/pestaña (favicon, PWA y accesos directos) debe ser transparente, compuesto exclusivamente por los dos triángulos estilizados, sin fondo blanco ni crema.
2. **Tamaño Óptimo en Pestaña vs PWA**: El icono de la ventana del navegador (`app/icon.svg` y `app/favicon.ico`) debe aprovechar el espacio visual de la pestaña (~85%+ de ocupación centrado) para verse grande y nítido. Los iconos de instalación PWA (`public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`) conservan su escala protegida (~52.5%) para adaptarse a las máscaras y bordes de los sistemas operativos móviles y de escritorio sin verse modificados.

---

## 13. Textos Simplificados y Estructura en la Portada (`components/summit-tracker.tsx`, `app/globals.css`)

1. **Eliminación de Subtítulos y Eyebrows**:
   - Eyebrows de Hero eliminados: *"UN RETO, 47 PICOS"*, *"UN RETO, 196 PAÍSES"*, *"UN RETO, EXPERIENCIAS GLOBALES"*.
   - Subtítulos de Hero eliminados: *"El mapa para conquistar el techo de cada provincia española."*, *"El mapa para registrar todas las experiencias de tu vida."*, *"El mapa para registrar cada país del mundo que has visitado."*.
   - Eyebrow de Reto eliminado: *"EL RETO COMPLETO"*.
   - Eyebrow de Mapa eliminado: *"TU PROGRESO"*.
   - Subtítulos de Mapa eliminados: *"Selecciona cualquier marcador para conocer el pico o registrar una ascensión."*, *"Haz clic en cualquier país para ver su información o marcarlo como visitado."*.
2. **Ocultación Estricta de Lemas del Hero en Móvil y Tableta (`<= 1023px`)**:
   - En todos los dispositivos móviles y tabletas (`<= 1023px`), los lemas y títulos de frases del hero (`hero-title-wrap--motto`, ej. *"Explora el mundo. Márcalo en tu mapa."*, *"Sube alto. Déjalo escrito."*, *"Vive experiencias. Márcalo en tu mapa."*) están **estrictamente ocultos** (`display: none !important;` y clase `hide-on-mobile`). En móvil y tableta el hero muestra exclusivamente la estadística/ratio y la barra de progreso (y el selector de modo si aplica), sin textos de frases.
3. **Lema de Experiencias**:
   - En el hero de experiencias, se unifica la redacción a *"Márcalo en tu mapa."*.
4. **Iconos de Fondo en Desktop Suprimidos**:
   - Se elimina el símbolo unicode de fondo en el ratio del hero (`mountain-art`).
5. **Banda del Hero Más Estrecha**:
   - Reducción del padding vertical del hero a 24px (desktop) y 18-20px (tablet/móvil), y `margin: 0` en `h1`.
6. **Eliminación de Banda Intermedia**:
   - Eliminación de la sección `.challenge-summary` ("Un país por descubrir, una cima cada vez" / "Un mundo por explorar...").

---

## 14. Navegación y Desplazamiento a la Vista de Mapa (`components/summit-tracker.tsx`, `app/globals.css`)

1. **Cabecera Fija (`position: sticky`)**: `.topbar` debe conservar en todo momento `position: sticky; top: 0; z-index: 20;` para permanecer anclada al hacer scroll. El contenedor `.app-mode-switch` se centra absolutamente sin degradar la cabecera a `position: relative`.
2. **Comportamiento del Enlace «Mapa»**:
   - Desde otras pestañas (Social, Ranking, Perfil): el enlace «Mapa» (`topbar-nav-link--mapa`) navega a la página principal de forma normal (`/` o `/picos`), cargando la cabecera y el hero en la parte superior sin forzar ningún scroll.
   - Estando ya en la página principal: pulsar en «Mapa» ejecuta `scrollToMap`, desplazando la vista suavemente hasta alinear la leyenda (`#mapa`) inmediatamente debajo de la cabecera fija y mostrando el mapa por debajo, ocultando el hero superior.
   - Pulsar en el logotipo «Atlas» (`brand`) desplaza la vista suavemente arriba del todo (`scrollY: 0`).

---

## 15. Píldora de Búsqueda, Filtro de Siguiendo, Experiencias y Franja Vertebral en Social (`components/social-tab.tsx`, `feed-tab.tsx`, `app/globals.css`)

1. **Píldora de Búsqueda, Filtro de Siguiendo y Píldora de Experiencias en Social**:
   - En desktop, la barra de controles (`.social-feed-controls`) está alineada con el ancho del contenedor de los posts (`max-width: 680px; margin: 0 auto;`).
   - La píldora de búsqueda (`.social-search-box`) prescinde del prefijo "Buscar por", usando placeholders concisos según la modalidad activa (`"Usuario, picos, fecha..."`, `"Usuario, país, fecha..."` o `"Usuario, experiencia, fecha..."`). Permite buscar simultáneamente por `@usuario`, país (o cumbre), fecha o combinación de ellos.
   - El buscador oculta estrictamente el botón de cancelación nativo del navegador (`::-webkit-search-cancel-button`) para prevenir la aparición de dos cruces, manteniendo únicamente el botón de borrado de Atlas (`.social-search-clear`).
   - A la derecha de la barra de búsqueda (agrupados a la izquierda mediante `.social-feed-controls-left`), se ubica el botón de filtro «Siguiendo» (`.social-following-btn`) con icono `UserRoundCheck`. Al activarse, filtra el feed para mostrar únicamente las actividades de las personas a las que sigue el usuario.
   - La píldora de alternancia de experiencias (`.diff-toggle-wrap`) se sitúa ajustada a la derecha de la columna de posts en desktop, dejando un espacio visible entre el bloque de búsqueda/siguiendo y el botón de experiencias. Al activarse, traslada toda la pestaña de Social y el feed al modo oscuro (`.mode-experiences`), garantizando máxima legibilidad en publicaciones, cifras, enlaces y campo de búsqueda, y filtrando el feed para mostrar estrictamente solo experiencias (excluyendo países). Al desactivarse, vuelve a mostrar exclusivamente países.
2. **Alineación Vertical del Perfil**: El bloque de perfil (avatar, `@username` y conexiones) tiene `margin-top: 4px` y `margin-bottom: 0` tanto en desktop como en móvil para sentarse en una posición óptica más baja y natural.
3. **Inmovilidad e Invarianza de Modo en Móvil**: En móvil (`<= 700px`), el hero de social utiliza una cuadrícula de dos columnas fijas (`grid-template-columns: 1fr 1fr; max-width: 380px; margin: 0 auto;`) con el bloque de perfil alineado al inicio (`padding-left: 6px`). Esto garantiza que el perfil permanezca estrictamente inmóvil e invariable independientemente de si se conmuta entre 47 Picos, 196 Países o Experiencias.

---

## 16. Botón Central de Seguir en la Página de Otro Usuario (`components/summit-tracker.tsx`, `app/globals.css`)

1. **Estados del Botón Central**:
   - **No seguido**: Icono `UserRoundPlus` (`user-round-plus`). Debajo del círculo, etiqueta de texto `"Seguir"` centrada.
   - **Siguiendo (estado normal)**: Icono `UserRoundCheck` (`user-round-check`). Debajo del círculo, etiqueta de texto `"Siguiendo"`.
   - **Siguiendo (hover del ratón)**: El icono conmuta a `UserRoundMinus` (`user-round-minus`), adquiriendo estilo de alerta (`color: #e53e3e`).
   - **Solicitud pendiente (usuario privado)**: Icono `UserRoundArrowLeft` (`user-round-arrow-left`). Debajo del círculo, etiqueta de texto `"pendiente"`.
2. **Disposición y Centrado**: El contenedor `.hero-target-follow-center` organiza verticalmente el botón circular (`.hero-center-follow-btn`) y el texto (`.hero-center-follow-label`) centrados entre el título del mapa y las estadísticas del usuario.

---

## 17. Experiencia y Layout en el Mapa Colectivo (`components/collective-map.tsx`, `components/ranking.css`)

1. **Posición del Pop-up de Visitantes Abajo a la Derecha**:
   - La tarjeta emergente de visitantes (`.collective-visitors-panel`) se sitúa en la esquina inferior derecha (`bottom: 24px; right: 24px;` en desktop, hoja inferior animada `bottom: 0;` en móvil).
   - Esta ubicación previene que el panel cubra los controles situados arriba a la derecha (el buscador / lupa `.map-search-control` y el interruptor de experiencias `ExperiencesToggleControl`).
2. **Botón Unificado de Siguiendo**:
   - En la cabecera del mapa colectivo se prescinde de píldoras dobles («Global» / «Siguiendo»), empleando el botón canónico `.social-following-btn` con el icono `UserRoundCheck` y la etiqueta `"Siguiendo"`.
   - Al pulsarlo, conmuta el ámbito a `following` y filtra reactivamente tanto los países como los marcadores de experiencias para reflejar únicamente a los usuarios seguidos.
3. **Sincronización Bidireccional de «Siguiendo» entre Ranking y Mapa Colectivo**:
   - El estado del filtro (`scope`: `all` vs `following`) se encuentra sincronizado bidireccionalmente entre la pestaña de Ranking y el Mapa Colectivo.
   - Si se activa o desactiva en el ranking, el mapa colectivo se abre reflejando ese estado (`scope={scope}`); si se activa o desactiva dentro del mapa colectivo, el cambio se traslada de vuelta al ranking (`onScopeChange={handleScopeChange}`) para mantener la coherencia en todo momento.
4. **Tipografía Conforme al Sistema de Diseño**:
   - Encabezados principales (`h2`, `h3` del panel): `Playfair Display, Georgia, serif`.
   - Interfaz, recuentos, listas, leyendas y tooltips: `DM Sans, sans-serif`.
5. **Disponibilidad Dual (Países y Picos)**:
   - El mapa colectivo está plenamente disponible tanto para 196 Países como para 47 Picos desde la pestaña de Ranking.
   - En ambas modalidades la barra de búsqueda superior derecha (`MapSearchControl`) y el botón de filtro «Siguiendo» (`.social-following-btn` con `UserRoundCheck`) son estructural y visualmente idénticos, adaptando dinámicamente las estadísticas (`picos` y `escaladores`), los marcadores físicos de cumbres y provincias con sus gradientes de color propios (en picos: verde oscuro `#5c9b7d` para 3+, verde claro `#bcd4c8` para 2, terracota `#c75a3a` para 1, y neutro para 0), la leyenda y la cartografía a la geografía española.

---

## 18. Ocultación del Botón de Círculos Concéntricos en el Mapa al Seleccionar Ubicación (`components/world-map.tsx`, `components/summit-tracker.tsx`)

1. **Prevención de Bifurcaciones al Seleccionar Ubicación**:
   - Mientras el usuario se encuentra en el flujo de selección de coordenadas para una experiencia (`selectingLocation` / `selectingLocationForExp` activo, mostrando el aviso flotante *"Haz clic en el mapa para situar la experiencia o busca el lugar aquí"*), el botón flotante del mapa con el icono de círculos concéntricos (`Añadir experiencia en el mapa`) debe permanecer **estrictamente oculto** (`!selectingLocation` y `!selectingLocationForExp`).
   - Esto evita que el usuario pueda abrir el selector de experiencias e iniciar la selección de otra experiencia diferente simultáneamente mientras ya está definiendo la ubicación de una experiencia previa.

---

## 19. Bloqueo de Scroll de Fondo en Modales (`components/summit-tracker.tsx`, `lib/scroll-lock.ts`)

1. **Bloqueo de Fondo al Seleccionar Categoría y Experiencia**:
   - Al abrir el modal de selección de categoría y experiencia (`expSelectorOpen`), así como los modales de papelera, categorías o confirmación, `isScrollLocked` debe evaluar a `true` e invocar `lockScroll()`, estableciendo `document.documentElement.style.overflow = "hidden"` y `document.body.style.overflow = "hidden"`.
   - Se debe detener la propagación de eventos `wheel` en el backdrop (`onWheel={(e) => e.stopPropagation()}`) y contener el desplazamiento en el cuerpo del modal (`overscrollBehavior: "contain"`), previniendo cualquier desplazamiento indeseado de la página o mapa en segundo plano.

---

## 20. Fijación de Pantalla en el Mapa y Cruz de Cancelación al Situar Experiencia (`components/summit-tracker.tsx`, `components/world-map.tsx`)

1. **Fijación al Mapa y Bloqueo de Scroll Exterior**:
   - Durante la selección de ubicación de una experiencia (`selectingLocationForExp` / `selectingLocation` activo), se activa `isScrollLocked`, bloqueando estrictamente el scroll de la ventana exterior (`document.documentElement` y `body`).
   - **En móvil (`<= 768px`)**: La página se desplaza arriba del todo (`window.scrollTo({ top: 0, behavior: "instant" })`), asegurando que ninguna experiencia del listado inferior quede dentro del campo de visión del usuario ni pueda ser seleccionada.
   - **En escritorio**: La vista se alinea a la sección del mapa (`#mapa`), colocándolo directamente debajo de la cabecera fija.
   - Se garantiza la interactividad completa sobre el mapa Leaflet: el usuario puede hacer zoom (rueda de ratón, gestos táctiles) y arrastrar/panear el mapa libremente para explorar el mundo sin que la página exterior se mueva.

2. **Botón de Cruz (`X`) para Cancelar y Cerrar Solicitud**:
   - El banner rectangular flotante superior (*"Haz clic en el mapa para situar la experiencia o busca el lugar aquí"*) dispone en su lateral derecho de un botón circular con el icono de la cruz (`.selecting-location-cancel-btn`).
   - Pulsar este botón o la tecla `Escape` cancela de forma inmediata la selección de ubicación y desbloquea el scroll general.



