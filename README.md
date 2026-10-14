# Atlas

Aplicación web social y cartográfica para registrar el recorrido por los 196 países del mundo, el ascenso al techo provincial de las 50 provincias españolas más Ceuta y Melilla (52 demarcaciones, 47 cumbres físicas) y experiencias de aventura personalizadas.

---

## Características Principales

- **Cartografía Interactiva**: Mapas mundiales y de España con renderizado fluido mediante Leaflet y capas vectoriales TopoJSON/GeoJSON optimizadas.
- **Techos Provinciales de España**: Seguimiento detallado de las 52 demarcaciones provinciales y sus 47 cumbres físicas únicas.
- **196 Países del Mundo**: Marcado visual de territorios visitados, estadísticas de progreso y división por regiones.
- **Experiencias y Aventuras**: Registro de hitos y retos temáticos con seguimiento de sub-ítems.
- **Fotografías y Recuerdos**: Subida múltiple y compresión optimizada en cliente de fotografías para cada actividad.
- **Capa Social y Feed**: Publicación en tiempo real de ascensiones, países y experiencias con enlaces a rutas (Strava, Wikiloc, etc.) y notas de viaje.
- **Rankings**: Tablas de clasificación globales y de usuarios seguidos, tanto para cumbres como para países.
- **Soporte PWA**: Instalable directamente en dispositivos móviles como aplicación web progresiva.

---

## Stack Tecnológico

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router) & [React 19](https://react.dev/)
- **Lenguaje**: TypeScript
- **Cartografía**: [Leaflet](https://leafletjs.com/), `react-leaflet`, `topojson-client`
- **Backend & Autenticación**: [Supabase](https://supabase.com/) (PostgreSQL con Row Level Security y Auth)
- **Almacenamiento Multimedia**: [Cloudflare R2](https://www.cloudflare.com/) (Almacenamiento de fotografías con CDN y control de límite de 9,5 GB)
- **Estilos**: CSS moderno con CSS Variables y diseño adaptativo (responsive)
- **Testing**: [Vitest](https://vitest.dev/) con suite de pruebas unitarias, integración e invariantes

---

## Desarrollo Local

### Requisitos previos
- Node.js >= 20.0.0
- npm (o pnpm)

### Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo (http://localhost:3000)
npm run dev

# Compilar para producción
npm run build
```

---

## Estructura del Proyecto

```text
├── .agents/              # Configuración de agentes: skills, reglas e invariantes
├── app/                  # Next.js 15 App Router (rutas, layouts, API endpoints)
├── components/           # Componentes UI (mapas Leaflet, feeds, ranking, modal de fotos)
├── data/                 # Datasets estáticos: peaks.ts (52/47), countries.ts (196), experiences.ts
├── docs/                 # Documentación técnica y decisiones de arquitectura (ADR)
├── lib/                  # Utilidades y clientes: supabase.ts, image-utils.ts
├── public/               # Cartografía TopoJSON/GeoJSON y assets estáticos
├── scripts/              # Herramientas de verificación y seguridad
├── supabase/migrations/  # Migraciones SQL contiguas con RLS obligatorio
└── tests/                # Suite de pruebas automatizadas y mocks en memoria
```

---

## Arnés de Pruebas y Verificación (Harness)

El proyecto cuenta con un sistema estricto de verificación técnica e invariantes críticas:

```bash
# Bucle rápido: comprobación de ficheros, tipos TypeScript y suite Vitest (~10s)
npm run verify:fast

# Ejecutar suite completa de tests
npm test

# Verificación canónica pre-push / producción (Tipos + Linter + Tests + Build)
npm run verify

# Evaluador de benchmarks de agentes
npm run harness:eval
```

- **Mocks**: Cliente en memoria de Supabase en [`tests/mocks/supabase-mock.ts`](./tests/mocks/supabase-mock.ts) para pruebas aisladas y deterministas.
- **Reportes**: Los benchmarks generan métricas en [`.agents/eval/reports/benchmark-report.md`](./.agents/eval/reports/benchmark-report.md).

---

## Skills para Asistentes y Agentes (`.agents/skills/`)

Para asistentes de IA y agentes en Antigravity, se dispone de 4 skills canónicas:

1. [**`code-verification-and-quality`**](./.agents/skills/code-verification-and-quality/SKILL.md): Puerta de calidad, reglas de TypeScript, ESLint, Vitest y resolución de errores.
2. [**`supabase-and-migrations`**](./.agents/skills/supabase-and-migrations/SKILL.md): Convenciones de migraciones SQL (001 a 021+), políticas RLS y funciones PL/pgSQL.
3. [**`geodata-and-maps`**](./.agents/skills/geodata-and-maps/SKILL.md): Gestión de los 52 techos provinciales (47 físicos), 196 países, regiones y mapas Leaflet.
4. [**`media-and-experiences`**](./.agents/skills/media-and-experiences/SKILL.md): Optimización de imágenes, subidas a storage y sistema de experiencias personalizadas.
