# 47 Picos & 196 Países · Contexto Persistente para Agentes

> Aplicación web social y cartográfica para registrar el ascenso al techo provincial de las 50 provincias españolas más Ceuta y Melilla (52 demarcaciones, 47 cumbres físicas), el recorrido por 196 países del mundo y experiencias de aventura personalizadas.
> Construida con Next.js 15 (App Router), React 19, TypeScript, Leaflet, Supabase (Auth, Postgres RLS) y Cloudflare R2 (Storage).

---

## 1. Comandos Canónicos de Desarrollo y Verificación

Todo agente debe utilizar estrictamente estos comandos:

| Acción | Comando | Notas |
| :--- | :--- | :--- |
| **Instalar dependencias** | `npm install` | Requiere Node >= 20 |
| **Servidor de desarrollo** | `npm run dev` | Puerto 3000 por defecto |
| **Compilación de producción** | `npm run build` | Valida rutas estáticas y bundles |
| **Linter de código** | `npm run lint` | ESLint 9 |
| **Suite de pruebas** | `npm test` | Vitest en modo headless |
| **Bucle rápido de desarrollo** | `npm run verify:fast` | **Inner Loop**: Ficheros + Tipos + Tests (~10s). Usar en cada iteración. |
| **Punto único de verificación** | `npm run verify` | **Outer Loop / Pre-Push**: Tipos + Lint + Tests + Build (~60s). Solo al solicitar push o entrega final. |
| **Evaluador de benchmarks** | `npm run harness:eval` | Valida contratos y tareas de agentes |

---

## 2. Definición de «Terminado» y Protocolo de Verificación (Two-Tier Loop)

### 2.1 Bucle Rápido vs Bucle Completo
- **Bucle Rápido de Iteración (`npm run verify:fast` o `npm test`)**: Comando obligatorio y predeterminado durante el trabajo iterativo, refactorización o corrección de bugs. Valida protección de archivos, tipos estáticos TypeScript y la suite completa de Vitest en ~10-12s, sin sobrecargar con `next build`.
- **Bucle Completo / Puerta Pre-Push (`npm run verify`)**: Ejecuta el oráculo íntegro con build de producción y auditoría ESLint. **Se ejecuta únicamente cuando el usuario solicite explícitamente hacer push, commit de finalización o cierre definitivo de la tarea.**

### 2.2 Criterio de Aceptación (Definition of Done)
Una tarea sólo se considera concluida cuando:
1. `npm run verify` finaliza con código de salida `0` sin excepciones al momento de la entrega o push.
2. No se modifican migraciones de Supabase ya consolidadas (`001` a `021`).
3. El estado en disco refleja los cambios sin ficheros temporales ni dependencias rotas.

---

## 3. Estructura de Directorios y Responsabilidades

```text
├── .agents/              # Configuración de agentes: rules/, skills/, workflows/, eval/
├── app/                  # Next.js 15 App Router (páginas, layouts, APIs /api/keepalive)
├── components/           # Componentes UI (mapas Leaflet, feeds, ranking, modal de fotos)
├── data/                 # Datasets estáticos: peaks.ts (52/47), countries.ts (196), experiences.ts, regions.ts
├── docs/                 # Memoria persistente: architecture.md, decisions/ (ADR), plans/
├── lib/                  # Clientes e utilidades: supabase.ts, image-utils.ts
├── public/               # Cartografía TopoJSON/GeoJSON y assets estáticos
├── scripts/              # Herramientas: verify.sh, verify.mjs, protect-files.mjs, compress-photos
├── supabase/migrations/  # Migraciones SQL contiguas (001 a 021+) con RLS obligatorio
└── tests/                # Oráculos de prueba automáticos y mocks en memoria (@/tests/mocks)
```

---

## 4. Invariantes Críticas del Proyecto (No Regresiones)

> ⚠️ **REGLA SUPREMA DE INVARIANTES**: Toda regla documentada en las invariantes (elementos eliminados, jerarquías, estructuras y comportamientos) es **ESTRICTAMENTE VINCULANTE Y NO NEGOCIABLE**. Está **TERMINANTEMENTE PROHIBIDO** modificar, relajar, contradecir o reintroducir elementos eliminados sin el consentimiento previo y explícito del usuario.

### 4.1 Estructura en Feed (`components/feed-tab.tsx`)
- **Enlace del título**: Siempre debe apuntar a `#panel=recordId` (`feed-record-title`). El título contiene únicamente el nombre del lugar o experiencia (`displayTitle = finalLocationName`), sin concatenar fechas.
- **Ubicación de la fecha**: La fecha de la actividad o rango de fechas va SIEMPRE en la cabecera debajo del nombre de usuario (`feed-card-header`), NUNCA en el título.
- **Compartir publicaciones**: Cada tarjeta del feed incluye obligatoriamente el botón de compartir (`feed-share-btn`) con deep-link a la actividad (`#panel=${recordId}`).
- **Sin botones de likes/dislikes/comentarios**: Las publicaciones del feed no muestran barra de reacciones ni botones de like/dislike/comentar.


### 4.2 Proporción de Picos (47 vs 52) y Experiencias (`components/summit-tracker.tsx`, `social-tab.tsx`)
- **47 Cimas Físicas**: Existen 52 demarcaciones provinciales pero **47 cumbres físicas únicas**. Las 5 compartidas son: Gorbea (Álava/Vizcaya), Torre Cerredo (León/Asturias), Peñalara (Madrid/Segovia), Peña Trevinca (Orense/Zamora) y Moncayo (Soria/Zaragoza).
- **Cálculo de Completados**: Siempre calcular picos completados mediante nombres únicos (`uniquePeakNames.size`), nunca por ID de demarcación.
- **Experiencias**: `cachedTotalCounts.experiences` nunca debe comenzar en `0`; inicializar con `predefinedCategories.reduce(...)`.
- **Sub-Items**: Una experiencia con sub-items sólo se computa completada si **todos** sus sub-items están marcados.
- **Inmutabilidad de Categorías por Defecto**: Las categorías por defecto (`predefinedCategories`) son estrictamente inmutables en nombre e icono. Solo se pueden editar las categorías personalizadas creadas por el usuario (`isCustomCat`). Para las categorías por defecto únicamente aparece el icono de la cruz para enviarlas a la papelera (`hidden_items`).

### 4.3 Ciclo de Vida de Autenticación (`components/auth-context.tsx`)
- **Sin Deslogueos Prematuros**: Jamás invocar `localStorage.removeItem("app_user_profile")` ni forzar `profile = null` en montaje inicial o estados transitorios de sesión nula.
- **Limpieza Estricta en SIGNED_OUT**: La sesión sólo se purga ante evento `SIGNED_OUT` explícito o invocación de `signOut()`.
- **Persistencia**: `AuthProvider` en `RootLayout` mantiene `globalSession` y `globalProfile` en memoria entre navegaciones.

### 4.4 Hidratación SSR y Mapas Leaflet
- Mapas (`spain-map.tsx`, `world-map.tsx`) dependen de `window`: cargar siempre mediante `dynamic(() => import(...), { ssr: false })`.
- Flag de perfil (`enable_experiences`) debe protegerse con estado `mounted` (`useEffect(() => setMounted(true), [])`) para evitar mismatch de hidratación.

### 4.5 Ranking e Inmutabilidad de Layout (`components/ranking.css`, `app/globals.css`, `components/ranking-tab.tsx`)
- Columnas del ranking inmutables independientemente de la longitud de textos o filtros.
- Avatares del podio Top-3 requieren `margin: 4px;` en `.ranking-avatar` para evitar recorte del contorno.
- `html, body` deben conservar `scrollbar-gutter: stable;`.
- **Cómputo Estricto de Participantes en Ranking**: El ranking contabiliza **ÚNICAMENTE** a personas que hayan registrado al menos un elemento (`ascents_count > 0` en países o cumbres). Quienes no hayan registrado nada no contabilizan para el ranking ni para el número de exploradores/escaladores. Nunca tomar el conteo total de `profiles`.
- **Posición de la Lupa (Buscador del Mapa)**: La lupa (`.map-search-control`) se sitúa arriba (`top: 10px; right: 10px;` / `top: 8px; right: 8px;`) en el mapa normal y colectivo. **ÚNICAMENTE** se desplaza hacia abajo (`.map-search-control--offset`, `top: 48px;` / `top: 44px;`) cuando se visualiza el perfil de otro usuario y aparece el botón de comparar conmigo (`isReadOnly && session`).
- **Estabilidad Cromática de «Comparar conmigo» al Cambiar a Experiencias**: El botón flotante de «Comparar conmigo» (`.map-floating-btn`) no cambia de color al conmutar a modo experiencias (`.mode-experiences`), manteniendo invariables sus colores de fondo blanco, texto y acentos tanto en reposo como en hover y activo (`diffMode`).
- **Alineación Exacta de Controles con Pestaña Social y Mapa**: La barra de búsqueda, la píldora de «Siguiendo» y el selector de experiencias (`.social-feed-controls`) en `RankingTab` y `SocialTab` comparten la misma estructura de contenedores (`.page-container` con `paddingTop: '14px'`, `paddingBottom: '70px'`, `paddingLeft: '16px'`, `paddingRight: '16px'` y contenedor interno con `maxWidth: '680px', margin: '0 auto', width: '100%'`, reduciéndose a `padding-top: 8px !important` en móvil `<= 768px`), garantizando que la posición horizontal y vertical sea idéntica a la píldora de experiencias de la página de Mapa (`.map-section` a 14px / 8px del hero) para una transición completamente fluida y sin saltos visuales al alternar entre pestañas.
- **Leyenda Comparativa (Centrada en Móvil e Invarianza Cromática en Modo Oscuro)**: La leyenda comparativa (`.diff-legend`: 'Solo tú', 'Solo @usuario', 'Ambos', 'Ninguno') se centra horizontalmente en dispositivos móviles (`<= 768px`) conservando íntegramente todos sus elementos incluido 'Ninguno'. Además, los colores de los marcadores de la leyenda comparativa son estrictamente invariables al cambiar a modo experiencias / modo oscuro (`.mode-experiences`), manteniendo los colores canónicos ('Solo tú': `#7b52ab`, 'Solo @usuario': `#c75a3a`, 'Ambos': `#c5b3da`, 'Ninguno': `#ddd8d0`) sin adoptar variables de acento ni transparencias.

### 4.6 Botón de Cuenta en Cabecera y Modalidades (`summit-tracker.tsx`, `ranking-tab.tsx`, `social-tab.tsx`, `profile-settings.tsx`)
- **Solo Foto o Inicial en Cabecera Superior**: Arriba a la derecha (`.account-button`), solo debe aparecer la foto de perfil o la letra inicial (o `?`), **en ningún caso** el nombre del correo electrónico ni el nombre de usuario.
- **Jerarquía de Modalidades**: Modo experiencias depende estrictamente del Modo países. Si se desactiva el Modo países, experiencias se congela automáticamente (inactiva y deshabilitada en interfaz y ajustes).
- **Ocultación sin Pérdida de Datos**: Desactivar una modalidad oculta los botones, publicaciones y vistas correspondientes, pero conserva íntegramente los datos y registros del usuario.
- **Ajustes de Perfil sin Scroll**: El modal de ajustes de perfil debe ser completamente visible sin necesidad de scroll vertical.

### 4.7 Visualización de Fotos y Visor/Lightbox (`components/photo-lightbox.tsx`, `summit-tracker.tsx`, `feed-tab.tsx`)
- **Sin Fechas en Fotos**: En ningún caso deben mostrarse fechas como subtítulo o pie de foto (ni en las cuadrículas de fotos ni en el visor a pantalla completa/lightbox).
- **Descripción de Fotos**: Si una foto tiene descripción (`caption`), se muestra dicha descripción (`figcaption`). Si no tiene descripción, no se renderiza texto ni fecha automática de fallback.
- **Visor de Foto (Lightbox)**: Al abrir una foto en el visor, se muestra el título del lugar o experiencia y, si existe, la descripción personalizada, pero jamás la fecha del registro o de la toma de la foto.
- **Fondo Negro y No Fragilidad**: El visor tiene fondo negro puro (`#000000`). Tocar o hacer clic fuera de la foto en el fondo **no** cierra el visor, evitando cierres accidentales. El cierre se realiza exclusivamente mediante el botón explícito de cerrar (`X`), tecla `Escape` o navegación Atrás del historial.
- **Cero Solapamiento de Títulos e Imágenes**: El área de imagen (`.lightbox-stage`) y el área de información inferior (`.lightbox-footer`) son contenedores flex independientes en columna, de modo que la imagen nunca se sobrepone al título ni pie de foto en desktop ni móvil.
- **Zoom y Desplazamiento (Pan)**: Soporta ampliación y exploración fluida (rueda de ratón, doble clic/tap, pellizco táctil pinch-to-zoom y controles visuales), permitiendo arrastrar (pan) la imagen cuando el zoom está activo.
- **Editor de Fotos en Móvil (`components/photo-editor.tsx`, `app/globals.css`)**: Los botones de la barra inferior de herramientas (*"Rotar"*, *"Espejo H"*, *"Espejo V"*, *"Restablecer"*) deben mostrar su texto estrictamente en una única línea (`white-space: nowrap;`). En ningún caso (especialmente en móvil) debe haber un salto de línea entre *"Espejo"* y *"H"* o *"V"*. El espaciado (`gap`) y padding del contenedor se adaptan fluidamente al ancho móvil (`<= 768px`) para garantizar que todas las etiquetas queden completamente visibles en una sola línea sin desbordamiento.

### 4.8 Pantalla de Carga y Modales de Seguridad (`app/loading.tsx`, `components/delete-account-modal.tsx`)
- **Pantalla de Carga sin Abusos**: Una vez abierta una página (ej. Países), los datos quedan guardados y cacheados en memoria. Al navegar entre pestañas (Mapa, Social, Ranking) no debe mostrarse la pantalla de carga para transiciones puntuales o instantáneas. La pantalla de carga completa debe disponer de un retardo (debounce de al menos 700ms) para mostrarse únicamente cuando una carga requiera un tiempo prolongado perceptible.
- **Aislamiento en Modal de Eliminar Cuenta**: El diálogo de confirmación debe aislarse completamente del backdrop padre (`ProfileSettings`) y detener la propagación de eventos (`onClick`, `onMouseDown`, `onKeyDown`). El campo de texto de confirmación no debe cerrarse al hacer clic en él ni al escribir en él.

### 4.9 Iconos y Logo de la Aplicación (`app/icon.svg`, `app/favicon.ico`, `public/icon-192.svg`, `public/icon-512.svg`, `public/apple-touch-icon.png`, `public/icon-maskable-*.png`)
- **Logo sin Fondo en Ventana/Pestaña**: El icono de la aplicación en la ventana/pestaña (favicon, PWA y accesos directos estándar) debe ser transparente, compuesto exclusivamente por los dos triángulos estilizados, sin fondo blanco ni crema.
- **Tamaño Óptimo en Pestaña vs PWA**: El icono de la ventana del navegador (`app/icon.svg` y `app/favicon.ico`) debe aprovechar el espacio visual de la pestaña (~85%+ de ocupación centrado) para verse grande y nítido. Los iconos de instalación PWA (`public/icon-192.png`, `public/icon-512.png`, `public/icon-1024.png`, `public/apple-touch-icon.png`) y adaptativos maskable (`public/icon-maskable-*.png`) se calibran a una escala fija del **50%** (`ratio = 0.50`) en `scripts/generate-icons.js`, garantizando un margen blanco limpio, proporcionado y centrado dentro de las máscaras circulares y squircle de Android e iOS sin pegarse a los bordes ni quedar diminuto.

### 4.10 Textos Simplificados y Estructura en la Portada (`components/summit-tracker.tsx`, `app/globals.css`)
- **Eliminación de Subtítulos y Eyebrows Innecesarios**: Se suprimen los lemas ("UN RETO...", "El mapa para..."), "EL RETO COMPLETO", "TU PROGRESO" y los textos explicativos redundantes de selección de mapa ("Selecciona cualquier marcador...", "Haz clic en cualquier país..."). En el hero de experiencias, el lema se unifica a *"Márcalo en tu mapa."*.
- **Ocultación Estricta de Lemas en Móvil y Tableta (`<= 1023px`)**: En todos los dispositivos móviles y tabletas (`<= 1023px`), los lemas y títulos de frases del hero (`hero-title-wrap--motto`, ej. *"Explora el mundo. Márcalo en tu mapa."*, *"Sube alto. Déjalo escrito."*, *"Vive experiencias. Márcalo en tu mapa."*) están **estrictamente ocultos** (`display: none !important;` y clase `hide-on-mobile`). El hero muestra únicamente el ratio numérico y la barra de progreso (y el selector de modos si aplica).
- **Iconos de Fondo en Desktop Suprimidos**: Se eliminan los símbolos unicode decorativos detrás del ratio de progreso (`mountain-art`).
- **Bandas del Hero Más Estrechas**: El padding vertical de `.hero` se reduce a 24px (escritorio) y 18-20px (tablet/móvil) con `margin: 0` en `h1`.
- **Eliminación de Banda Intermedia**: Se elimina la sección `.challenge-summary` ("Un país por descubrir, una cima cada vez" / "Un mundo por explorar..."), enlazando directamente el mapa con el listado.

### 4.11 Navegación y Desplazamiento a la Vista de Mapa (`summit-tracker.tsx`, `app/globals.css`)
- **Cabecera Fija (`position: sticky`)**: `.topbar` debe conservar en todo momento `position: sticky; top: 0; z-index: 20;` para permanecer anclada al hacer scroll. El contenedor `.app-mode-switch` se centra absolutamente sin degradar la cabecera a `position: relative`.
- **Comportamiento del Enlace «Mapa»**:
  - Desde otras pestañas (Social, Ranking, Perfil): el enlace «Mapa» (`topbar-nav-link--mapa`) navega a la página principal de forma normal (`/` o `/picos`), cargando la cabecera y el hero en la parte superior sin forzar ningún scroll.
  - Estando ya en la página principal: pulsar en «Mapa» ejecuta `scrollToMap`, desplazando la vista suavemente hasta alinear la leyenda (`#mapa`) inmediatamente debajo de la cabecera fija y mostrando el mapa por debajo, ocultando el hero superior.
  - Pulsar en el logotipo «Atlas» (`brand`) desplaza la vista suavemente arriba del todo (`scrollY: 0`).

### 4.12 Píldora de Búsqueda, Filtro de Siguiendo, Experiencias y Franja Vertebral en Social (`components/social-tab.tsx`, `feed-tab.tsx`, `app/globals.css`)
- **Píldora de Búsqueda, Filtro de Siguiendo y Píldora de Experiencias en Social**:
  - En desktop, la barra de controles (`.social-feed-controls`) está alineada con el ancho del contenedor de los posts (`max-width: 680px; margin: 0 auto;`).
  - La píldora de búsqueda (`.social-search-box`) prescinde del prefijo "Buscar por", usando placeholders concisos según la modalidad activa (`"Usuario, picos, fecha..."`, `"Usuario, país, fecha..."` o `"Usuario, experiencia, fecha..."`). Permite buscar simultáneamente por `@usuario`, país (o cumbre), fecha o combinación de ellos.
  - El buscador oculta estrictamente el botón de cancelación nativo del navegador (`::-webkit-search-cancel-button`) para prevenir la aparición de dos cruces, manteniendo únicamente el botón de borrado de Atlas (`.social-search-clear`).
  - A la derecha de la barra de búsqueda (agrupados a la izquierda mediante `.social-feed-controls-left`), se ubica el botón de filtro «Siguiendo» (`.social-following-btn`) con icono `UserRoundCheck`. Al activarse, filtra el feed para mostrar únicamente las actividades de las personas a las que sigue el usuario.
  - La píldora de alternancia de experiencias (`.diff-toggle-wrap`) se sitúa ajustada a la derecha de la columna de posts en desktop, dejando un espacio visible entre el bloque de búsqueda/siguiendo y el botón de experiencias. Al activarse, traslada toda la pestaña de Social y el feed al modo oscuro (`.mode-experiences`), garantizando máxima legibilidad en publicaciones, cifras, enlaces y campo de búsqueda, y filtrando el feed para mostrar estrictamente solo experiencias (excluyendo países). Al desactivarse, vuelve a mostrar exclusivamente países.
- **Alineación Vertical del Perfil**: El bloque de perfil (avatar, `@username` y conexiones) tiene `margin-top: 4px` y `margin-bottom: 0` tanto en desktop como en móvil para sentarse en una posición óptica más baja y natural.
- **Inmovilidad e Invarianza de Modo en Móvil**: En móvil (`<= 700px`), el hero de social utiliza una cuadrícula de dos columnas fijas (`grid-template-columns: 1fr 1fr; max-width: 380px; margin: 0 auto;`) con el bloque de perfil alineado al inicio (`padding-left: 6px`). Esto garantiza que el perfil permanezca estrictamente inmóvil e invariable independientemente de si se conmuta entre 47 Picos, 196 Países o Experiencias.

### 4.13 Botón Central de Seguir en la Página de Otro Usuario (`summit-tracker.tsx`, `app/globals.css`)
- **Estados del Botón Central**:
  - No seguido: Icono `UserRoundPlus` (`user-round-plus`). Debajo del círculo, etiqueta `"Seguir"` centrada.
  - Siguiendo (reposo): Icono `UserRoundCheck` (`user-round-check`). Debajo del círculo, etiqueta `"Siguiendo"`.
  - Siguiendo (hover): Icono conmuta a `UserRoundMinus` (`user-round-minus`) con estilo de alerta/rojo.
  - Solicitud pendiente (usuario privado): Icono `UserRoundArrowLeft` (`user-round-arrow-left`). Debajo del círculo, etiqueta `"pendiente"`.
- **Disposición Vertical Centrada**: `.hero-target-follow-center` organiza en columna el botón circular y el texto centrados entre el título y las estadísticas del usuario.

### 4.14 Experiencia en el Mapa Colectivo (`components/collective-map.tsx`, `components/ranking.css`)
- **Posición del Pop-up de Visitantes Abajo a la Derecha**: La ventana emergente de visitantes (`.collective-visitors-panel`) se posiciona abajo a la derecha (`bottom: 24px; right: 24px;` en desktop, hoja inferior en móvil), evitando cubrir la lupa de búsqueda (`top: 10px; right: 10px;`) y el conmutador de experiencias (`top: 56px; right: 10px;`).
- **Botón de Filtro «Siguiendo» Unificado**: En la cabecera superior derecha, en lugar de píldoras duales de global/siguiendo, se emplea el botón canónico `.social-following-btn` con el icono `UserRoundCheck` y el texto `"Siguiendo"`. Al activarse, filtra el mapa colectivo para mostrar exclusivamente las visitas y cumbres de las personas a las que sigue el usuario.
- **Sincronización Bidireccional de «Siguiendo» entre Ranking y Mapa Colectivo**: El estado del filtro (`scope`: `all` vs `following`) se encuentra sincronizado bidireccionalmente. Si se activa o desactiva en el ranking, el mapa colectivo se abre reflejando ese estado; si se activa o desactiva dentro del mapa colectivo, el cambio se traslada de vuelta al ranking para mantener la coherencia en todo momento.
- **Tipografía Homogénea**: Toda la interfaz del mapa colectivo se rige por las tipografías canónicas del sistema de diseño: `Playfair Display` para títulos (`h2` de cabecera y `h3` del pop-up) y `DM Sans` para el cuerpo, estadísticas, leyendas, listas y modales.
- **Disponibilidad Dual (Países y Picos)**: El mapa colectivo está plenamente disponible tanto para 196 Países como para 47 Picos desde la pestaña de Ranking. En ambas modalidades la barra de búsqueda superior derecha (`MapSearchControl`) y el botón de filtro «Siguiendo» (`.social-following-btn` con `UserRoundCheck`) son estructural y visualmente idénticos, adaptando dinámicamente las estadísticas (`picos` y `escaladores`), los marcadores físicos de cumbres y provincias con sus gradientes de color propios (en picos: verde oscuro `#5c9b7d` para 3+, verde claro `#bcd4c8` para 2, terracota `#c75a3a` para 1, y neutro para 0), la leyenda y la cartografía a la geografía española.

### 4.15 Ocultación del Botón de Experiencia (Círculos Concéntricos) durante la Selección de Ubicación (`components/world-map.tsx`, `components/summit-tracker.tsx`)
- **Prevención de Bifurcaciones al Seleccionar Ubicación**: Mientras el usuario está seleccionando la ubicación de una experiencia en el mapa (`selectingLocation` / `selectingLocationForExp` activo, mostrando el aviso *"Haz clic en el mapa para situar la experiencia o busca el lugar aquí"*), el botón flotante del mapa con el icono de círculos concéntricos (`Añadir experiencia en el mapa`) está **estrictamente oculto** (`!selectingLocation` y `!selectingLocationForExp`). Esto previene que el usuario pueda abrir el selector para una nueva experiencia simultáneamente mientras define la ubicación de otra.

### 4.16 Bloqueo Estricto de Scroll de Fondo en Modales (`components/summit-tracker.tsx`, `lib/scroll-lock.ts`)
- **Bloqueo del Fondo al Seleccionar Categoría y Experiencia**: Al abrir el modal de selección de categoría y experiencia (`expSelectorOpen`, disparado desde el botón de círculos concéntricos o gestión de experiencias), así como en cualquier modal secundario (`showTrashModal`, `editingCustomCategory`, `selectingCategoryForNewExp`, `editingCustomExp`, `confirmAction`, `assignToRecordModalOpen`), `isScrollLocked` debe activarse obligatoriamente para bloquear el scroll del documento (`overflow: hidden` en `documentElement` y `body`).
- **Contención de Eventos de Rueda y Overscroll**: El fondo modal (`.modal-backdrop`) y el contenedor del diálogo deben detener la propagación de eventos `wheel` (`onWheel={(e) => e.stopPropagation()}`) y contener el desbordamiento (`overscrollBehavior: "contain"`), impidiendo cualquier desplazamiento o movimiento accidental de la ventana o mapa situado por detrás.

### 4.17 Fijación de Pantalla en el Mapa y Cruz de Cancelación al Situar Experiencia (`components/summit-tracker.tsx`, `components/world-map.tsx`)
- **Fijación al Mapa y Bloqueo de Scroll Exterior**: Durante el modo de selección de ubicación de una experiencia (`selectingLocationForExp` / `selectingLocation` activo), se bloquea el scroll de la ventana (`isScrollLocked` activo) para impedir cualquier desplazamiento involuntario. En móvil (`<= 768px`), la vista se coloca arriba del todo (`top: 0`), garantizando que ninguna experiencia del listado inferior resulte visible ni accesible en pantalla. En escritorio, la vista se alinea de forma inmediata al mapa (`#mapa`) bajo la cabecera fija. El usuario puede interactuar plenamente con el mapa (hacer zoom con rueda táctil/ratón y arrastrar/panear el mapa mundial), pero la ventana exterior permanece estrictamente inmóvil.
- **Botón de Cruz (`X`) para Cerrar Solicitud**: El rectángulo emergente informativo (*"Haz clic en el mapa para situar la experiencia o busca el lugar aquí"*) incluye en su lateral derecho un botón circular con una cruz visible (`.selecting-location-cancel-btn`), que al pulsarse (o al presionar `Escape`) cancela y cierra limpiamente la solicitud, restaurando el scroll estándar de la página sin abrir formularios no solicitados.

### 4.18 Aislamiento de Scroll entre Pestañas y Rutas (`components/app-tabs-shell.tsx`, `components/social-tab.tsx`, `components/ranking-tab.tsx`)
- **Cero Permeabilidad de Scroll entre Vistas**: El scroll de una página (ej. Social) nunca debe arrastrarse ni permear al resto de páginas (Mapa, Ranking, Perfiles). Al navegar a una pestaña o ruta diferente mediante clics en la barra de navegación o enlaces, la nueva vista se inicializa estrictamente en la parte superior (`top: 0`) de forma instantánea (`behavior: "instant"`).
- **Control Manual de Restauración de Historial**: En `AppTabsShellInner`, se desactiva la restauración automática del navegador (`window.history.scrollRestoration = "manual"`) para delegar el control a la aplicación. Un mapa de historial en memoria registra las posiciones para restaurarlas exclusivamente ante eventos reales de navegación atrás/adelante (`popstate`).
- **Retorno Suave Arriba en Pestaña Activa**: Al hacer clic sobre el enlace de la pestaña que ya se encuentra activa en ese momento (ej. pulsar en «Social» estando ya en Social, o «Ranking» estando en Ranking), la página realiza un desplazamiento suave hacia arriba (`window.scrollTo({ top: 0, behavior: "smooth" })`).

### 4.19 Ciclo de Vida de Instalación PWA, Icono Oficial y Prevención de Prompts Fantasma (`components/install-prompt.tsx`, `components/summit-tracker.tsx`)
- **Icono Oficial Raster (`/icon-192.png`)**: En el diálogo de instalación PWA (`InstallPrompt`), el icono de la aplicación se renderiza estrictamente mediante la imagen oficial `/icon-192.png` precacheada en el Service Worker. Está estrictamente prohibido utilizar vectores SVG con referencias de degradado fragmentadas (`url(#id)`), ya que en subrutas de navegación cliente (ej. `/perfil/[username]`) los navegadores móviles resuelven el fragmento contra la URL completa y rompen el renderizado, mostrando un cuadro transparente o vacío.
- **Invalidación por Navegación y Descarte en Sesión**: En Chromium/Android, el evento nativo `beforeinstallprompt` se invalida automáticamente si ocurre una navegación o cambio de URL. Al pulsar «Cancelar» o cerrar el aviso (`handleClose`), se invoca `clearInstallPrompt()` y se almacena `pwa_dismissed_session = "true"` en `sessionStorage`, impidiendo que el pop-up reaparezca con un evento caducado al navegar entre pantallas en la misma sesión.
- **Detección de Instalación y Auto-ocultación de Controles**: Tras aceptar la instalación (`outcome === "accepted"` o eventos `appinstalled` / `atlas-app-installed`), se persiste `pwa_app_installed = "true"` en `localStorage`. En la web móvil, el icono de descargar se ubica en la cabecera (topbar) a la izquierda de la foto de perfil en el mismo lugar donde en PWA se ubica el icono de estadísticas (el icono de estadísticas permanece estrictamente oculto en web móvil cuando no sea PWA). Cuando la aplicación ya está instalada o se ejecuta en PWA (`alreadyInstalled` o `isStandalone()`), el botón de descarga se oculta automáticamente (`!alreadyInstalled`), mostrándose en su lugar el botón de estadísticas si es PWA. Si la app ya está instalada, la interfaz nunca debe mostrar mensajes confusos indicando pulsar los tres puntos (`⋮`), sino informar que la app ya se encuentra instalada en el dispositivo.

### 4.20 Configuración PWA, Splash Screen Nítido y Prevención de Barra Fuera de Ámbito (`app/layout.tsx`, `public/manifest.json`, `app/manifest.webmanifest`, `scripts/generate-icons.js`)
- **Resolución Nítida del Splash Screen (Sin Fallback Pixelado de Favicon)**:
  - En `app/layout.tsx`, el recurso `/favicon.ico` **JAMÁS** debe declarar `sizes: "any"`. Chromium / WebAPK en Android evalúa `"any"` como candidato prioritario para la pantalla de bienvenida (splash screen) y extrae el primer frame pequeño de 16x16 o 32x32 píxeles, provocando un splash screen extremadamente pixelado en pantallas móviles modernas. `favicon.ico` debe declarar explícitamente `sizes: "16x16 32x32 48x48"`.
  - En `<head>` y en los manifiestos PWA (`public/manifest.json` y `app/manifest.webmanifest`), se deben enlazar de forma prioritaria los iconos de alta definición `512x512` y `1024x1024` generados con remuestreo Lanczos-3 a 300 DPI, garantizando que el splash screen se renderice nítido y sin artefactos en cualquier resolución de pantalla.
- **Iconos Adaptativos Maskable al 50% con Fondo Blanco Sólido**:
  - Para la instalación en Android, se proveen iconos dedicados con `purpose: "maskable"` (`public/icon-maskable-192.png`, `icon-maskable-512.png`, `icon-maskable-1024.png`) con fondo blanco `#ffffff` y los triángulos al 50% de escala (`ratio = 0.50`), asegurando que al recortar la máscara del sistema operativo nunca se muestren bandas grises ni recortes indeseados en los vértices.
  - Los iconos estándar (`public/icon-192.svg`, `icon-512.svg`, `icon-1024.svg`) no incluyen `<rect>` de fondo (transparencia obligatoria).
- **Eliminación de la Franja Fuera de Ámbito (CustomTabToolbar en Android)**:
  - En `manifest.json` y `manifest.webmanifest`: `display: "standalone"`, `display_override: ["standalone", "window-controls-overlay"]`, `start_url: "/"`, y `scope: "/"`.
  - En `app/layout.tsx`: metaetiquetas `mobile-web-app-capable="yes"` y `application-name="Atlas"`, detección robusta de modo standalone (`display-mode: standalone`, `display-mode: fullscreen`, `navigator.standalone`, y `document.referrer.includes("android-app://")`), y redirección canónica preventiva si se accede desde un dominio heredado fuera de ámbito (`atlas-log.vercel.app`).
- **Reactividad Asíncrona en el Diálogo de Instalación PWA**:
  - Tanto en `components/install-prompt.tsx` como en `components/summit-tracker.tsx`, el manejador de clic de instalación implementa una espera asíncrona ante el evento `beforeinstallprompt` (evento personalizado `atlas-install-prompt-ready`) con fallback automático a instrucciones si el dispositivo no soporta el prompt nativo.
  - Purgado automático de claves antiguas de descarte en `localStorage` (`pwa_install_dismissed`) para permitir que la sugerencia de instalación vuelva a estar activa tras una desinstalación.
  - Detección preventiva con `navigator.getInstalledRelatedApps()` para no mostrar el botón de descarga en la cabecera si la app ya se encuentra instalada.

---

## 5. Reglas Críticas de Seguridad y Base de Datos

1. **Inmutabilidad de Migraciones**: Las migraciones históricas `001_` a `021_` **nunca se editan**. Cualquier cambio de esquema requiere crear `022_<nombre>.sql` (correlativo, idempotente y con `ENABLE ROW LEVEL SECURITY`).
2. **Secretos Protegidos**: Ficheros `.env*` nunca se commitean ni se exponen en cliente. Variables públicas llevan obligatoriamente prefijo `NEXT_PUBLIC_`.
3. **Mocks en Pruebas**: Nunca conectar a la base de datos real en tests unitarios; usar `@/tests/mocks/supabase-mock`.

---

## 6. Documentación Adicional Bajo Demanda

Para detalles arquitectónicos profundos, consultar según necesidad:
- Arquitectura completa del sistema: [`docs/architecture.md`](file:///c:/Users/jorge/Desktop/52_picos/docs/architecture.md)
- Registro de Decisiones de Arquitectura (ADR): [`docs/decisions/`](file:///c:/Users/jorge/Desktop/52_picos/docs/decisions/)
- Plantilla y seguimiento de tareas largas: [`docs/plans/template.md`](file:///c:/Users/jorge/Desktop/52_picos/docs/plans/template.md)
- Capacidades empaquetadas (Skills): [`.agents/skills/`](file:///c:/Users/jorge/Desktop/52_picos/.agents/skills/)
