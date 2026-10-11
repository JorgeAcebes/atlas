---
name: frontend-design-system
description: >-
  Guía canónica del sistema de diseño y arquitectura front-end de Atlas (47 Picos & 196 Países). Especifica la identidad visual editorial-cartográfica, tokens cromáticos por modalidad, tipografía, componentes canónicos, layouts y directrices para alinear las páginas de Social y Ranking con la página principal.
---

# Front-End Design System & Identidad Visual (Atlas)

Esta skill documenta la arquitectura visual, tokens, componentes y patrones de experiencia de usuario de la página principal de **Atlas (47 Picos & 196 Países)**, y establece las directrices canónicas para trasladar y homogeneizar dicha estética a las vistas de **Social** y **Ranking**.

---

## 1. Filosofía de Diseño e Identidad Visual

Atlas combina la estética de un **cuaderno de campo editorial / diario de expedición clásico** (inspirado en la cartografía de National Geographic y los cuadernos de alta montaña) con la agilidad e interactividad de una **Single Page Application moderna**.

### Principios Fundamentales:
1. **Sensación Táctil y Papel Cálido**: El fondo no es blanco clínico (`#ffffff`), sino un lienzo crema cálido (`--paper: #faf8f1`) que reduce la fatiga visual y evoca papel de calidad o mapas topográficos impresos.
2. **Jerarquía Tipográfica Editorial**: Combinación de una serifa literaria y elegante (`Playfair Display`) para títulos y números de impacto, una tipografía de interfaz legible y humana (`DM Sans`) para el cuerpo y navegación, y una monoespaciada técnica (`DM Mono`) para metadatos, provincias, coordenadas y chips numéricos.
3. **Economía Visual y Cero Fricción**: Elementos limpios sin sombras agresivas ni gradientes estridentes. Bordes sutiles de 1px (`--line`), radios compactos (2px - 6px) y animaciones fluidas y ligeras (`0.22s ease`).
4. **Paletas Semánticas según Modalidad de Reto**: La interfaz se adapta tonalmente según el contexto activo:
   - **47 Picos**: Tonos pino, salvia y bosque alpino.
   - **196 Países**: Tonos berenjena, amatista real y lavanda cartográfica.
   - **Experiencias**: Tema obsidiana nocturno / cielo estrellado.

---

## 2. Tokens de Color y Tematización Semántica

Los estilos principales residen en `app/globals.css`. Las variables se declaran en `:root` y se sobreescriben dinámicamente mediante clases de modo (`.mode-countries`, `.mode-experiences`).

### 2.1 Paleta Base: Modo Picos (Alpinismo)
```css
:root {
  --ink: #18342d;        /* Verde bosque muy oscuro, texto principal */
  --pine: #245f52;       /* Verde pino profundo, acento principal y botones primarios */
  --sage: #5c9b7d;       /* Verde salvia suave, barra de progreso y badges completados */
  --paper: #faf8f1;      /* Fondo pergamino/lienzo cálido */
  --sand: #f0eadc;       /* Arena suave para hovers, fondos secundarios y contrastes */
  --line: #dce4da;       /* Línea divisoria tenue verdosa */
  --muted: #62716b;      /* Gris verdoso para texto secundario y metadatos */
  --amber: #d2a54b;      /* Dorado cálido para wishlist y notas */
  --amber-bg: #fff8e7;   /* Fondo dorado suave */
  --danger: #a34f3d;     /* Terracota para acciones destructivas */
  --radius: 3px;         /* Radio base sutil */
  --transition: 0.22s ease;
}
```

### 2.2 Paleta Países: Modo Explorador (`.mode-countries`)
```css
.mode-countries {
  --ink: #2a1f3d;        /* Ciruela / berenjena profundo */
  --pine: #5b3a8c;       /* Púrpura imperial / amatista */
  --sage: #9570c7;       /* Lavanda suave */
  --paper: #faf8fc;      /* Papel perla con leve tinte lavanda */
  --sand: #f0e8f4;       /* Fondo secundario lila claro */
  --line: #ddd4e8;       /* Divisores púrpura apagados */
  --muted: #6b5f7a;      /* Texto secundario ciruela */
}
```

### 2.3 Paleta Experiencias: Modo Nocturno (`.mode-experiences`)
```css
.mode-experiences {
  --ink: #ffffff;
  --pine: #cba6f7;
  --sage: #a6adc8;
  --paper: #11111b;      /* Fondo obsidiana */
  --sand: #181825;
  --line: #313244;
  --muted: #a6adc8;
}
```

---

## 3. Sistema Tipográfico

La aplicación importa cuatro fuentes canónicas de Google Fonts:

| Rol | Familia | Uso Canónico | Ejemplos |
| :--- | :--- | :--- | :--- |
| **Titulares** | `Playfair Display` | Encabezados editoriales `h1`, `h2` | `h1`: 44px - 70px, cursiva para el remate (*Déjalo escrito.*) |
| **Cifras Elegantes & Ranking** | `Fraunces` | Posiciones del ranking (`.ranking-rank-num`), recuentos hero (`.hero-stat strong`), altitudes | Puestos del ranking `1.7rem`, números `54px`, tabular-nums |
| **Interfaz & Cuerpo** | `DM Sans` | Texto corrido, enlaces de navegación, botones, inputs | 13px - 15px, `font-weight: 400, 500, 600` |
| **Metadatos & Eyebrows** | `DM Mono` | Sobretítulos (eyebrows), códigos de provincia, etiquetas técnicas y fechas | 10px - 11px, `letter-spacing: 0.13em`, `text-transform: uppercase` |

---

## 4. Componentes y Patrones de Interfaz

### 4.1 Barra Superior (`.topbar`)
- **Altura fija**: 76px, pegajosa (`sticky; top: 0; z-index: 20`).
- **Efecto vidrio**: `background: rgba(250, 248, 241, 0.94); backdrop-filter: blur(10px);`.
- **Logotipo**: Doble triángulo estilizado (`.brand-icon`), sin texto redundante ni fondos sólidos.
- **Navegación**: Enlaces sencillos (`Mapa`, `Social`, `Ranking`). El enlace activo tiene subrayado fino (`::after`, 1.5px en `var(--pine)`).
- **Selector Central de Modo**: Conmutador flotante centrado (`.app-mode-switch`) tipo pastilla para alternar 47 Picos y 196 Países.
- **Botón de Usuario**: Arriba a la derecha (`.account-button`), exclusivamente avatar circular (29px) o inicial en mayúscula, **nunca** email ni nombre de usuario.

### 4.2 Hero Asimétrico (`.hero`)
- **Estructura en dos columnas**:
  1. *Izquierda*: Título principal en Playfair Display (ej. *Explora el mundo. Márcalo en tu mapa.*) con padding vertical compacto (24px escritorio, 18-20px móvil).
  2. *Derecha*: Bloque estadístico (`.hero-stat`) con borde izquierdo de 1px, número grande con fracción (`42 / 196`), unidad en texto mono y barra de progreso de 5px (`.progress`) con esquina redondeada y relleno en `var(--sage)`.

### 4.3 Conmutador de Retos (`.app-mode-switch`)
- Diseño tipo *segmented pill control* (`border-radius: 100px`, padding 3px, fondo `rgba(0,0,0,0.06)`).
- Indicador deslizante blanco con sombra muy suave (`box-shadow: 0 1px 4px rgba(0,0,0,0.08)`).
- Botones planos con tipografía de 12px seminegrita.

### 4.4 Barra de Filtros y Búsqueda
- **Caja de Búsqueda**: `.search-input-container` con lupa integrada a la izquierda, borde fino y foco en `var(--pine)`.
- **Píldoras de Filtro**: `.list-filter-pill` con esquinas redondeadas, fondo transparente o blanco, y contador badge (`.pill-count`) integrado.

### 4.5 Tarjetas de Lista (`.peak-list-item`)
- Cuadrícula responsiva (`.peak-list-grid`, `minmax(260px, 1fr)`).
- Cada tarjeta presenta:
  - Micro-icono circular indicador de estado a la izquierda (20px, triángulo/diamante/estrella/check).
  - Bloque central con sobretítulo mono (`.item-province`) y título en seminegrita (`.item-name`).
  - Extremo derecho con altitud o código en color de acento (`var(--pine)` o `var(--purple)`).
  - Estados hover y active sutiles con transición de borde y fondo.

### 4.6 Botones Primarios y Secundarios
- `.button--green`: Fondo verde pino (`#245f52`), texto blanco, sombra al hover.
- `.button--purple`: Fondo púrpura (`#5b3a8c`), texto blanco.
- `.button--outline`: Borde de 1px en color de marca, fondo transparente.
- `.button--quiet`: Sin borde, fondo arena al hover (`var(--sand)`).

---

## 5. Diagnóstico de Discrepancias Actuales

### 5.1 Estado Actual de la Página de Ranking
- **Tipografía desconectada**: Emplea `Fraunces`, `IBM Plex Mono` e `Inter` en lugar de `Playfair Display`, `DM Mono` y `DM Sans`.
- **Paleta disonante**: Emplea marrones café (`#3A2A17`, `#6B5638`) y dorados saturados (`#E8944D`), desconectados del tono verde bosque o púrpura de la aplicación.
- **Estructura de Podio**: Muestra una tabla plana con columnas rígidas donde los avatares de Top-3 llevan borde dorado/plata/bronce, pero carece del impacto editorial y la armonía que tiene el hero de la página principal.

### 5.2 Estado Actual de la Página Social (Feed y Comunidad)
- **Falta de Tratamiento Editorial**: Las tarjetas de actividad (`.feed-card`) parecen posts genéricos de red social blanca estándar, con bordes y fuentes sin la personalidad cartográfica de la portada.
- **Uso excesivo de estilos en línea (`style={{ ... }}`)** que diluyen la coherencia visual con `globals.css`.
- **Sidebar de Perfil**: El bloque lateral de usuario no aprovecha el lenguaje de las tarjetas de expedición ni las barras de progreso estilizadas de la portada.

---

## 6. Pautas para Adaptar Ranking y Social al Sistema de Diseño

Para lograr coherencia integral (100% Atlas):

1. **Unificación Tipográfica**:
   - Encabezados de Ranking y Social en `Playfair Display`.
   - Nombres de usuario y textos en `DM Sans`.
   - Números de posición del ranking y cifras elegantes en `Fraunces`.
   - Fechas y etiquetas de metadatos en `DM Mono`.
2. **Adopción de Tokens Globales**:
   - Sustituir cualquier marrón o dorado ajeno por `--paper`, `--sand`, `--line`, `--ink`, `--pine` y `--sage`.
   - Respetar la alternancia dinámica verde/púrpura según el modo seleccionado (Picos vs. Países).
3. **Morfología de Componentes**:
   - Los podios deben presentarse con tarjetas elevadas o filas estructuradas que evoquen medallas de exploración o placas de campo.
   - Las publicaciones del feed deben tener aspecto de **página de bitácora o pasaporte de expedición**, con sellos de estado (Pico completado / País visitado), fecha en formato monoespaciado, y tipografía de lugar en Playfair Display o DM Sans seminegrita.
