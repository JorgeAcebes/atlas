import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

export function readFile(relPath: string): string {
  return fs.readFileSync(path.join(rootDir, relPath), "utf8");
}

export function readFiles(relPaths: string[]): string {
  return relPaths
    .filter((p) => fs.existsSync(path.join(rootDir, p)))
    .map((p) => `// === ${p} ===\n${readFile(p)}`)
    .join("\n\n");
}

export function readDirRecursive(
  relDir: string,
  exts: string[] = [".ts", ".tsx", ".css"]
): string {
  const fullDir = path.join(rootDir, relDir);
  if (!fs.existsSync(fullDir)) return "";

  const collected: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (exts.some((ext) => entry.name.endsWith(ext))) {
        collected.push(fullPath);
      }
    }
  };
  walk(fullDir);

  return collected
    .map((fullPath) => {
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      return `/* === ${rel} === */\n${fs.readFileSync(fullPath, "utf8")}`;
    })
    .join("\n\n");
}

const STYLE_ORDER = [
  "styles/tokens.css",
  "styles/base.css",
  "styles/navigation.css",
  "styles/hero.css",
  "styles/maps.css",
  "styles/item-list.css",
  "styles/detail-panel.css",
  "styles/media-viewer.css",
  "styles/modals.css",
  "styles/social-feed.css",
];

export function readAllStyles(): string {
  return readFiles(["app/globals.css", ...STYLE_ORDER]);
}

export function readRankingStyles(): string {
  return readFiles(["components/ranking.css", "components/maps/collective-map.css"]);
}

export function readTrackerSources(): string {
  return [
    readFiles([
      "components/summit-tracker.tsx",
      "components/layout/app-topbar.tsx",
      "components/shared/record-link-badge.tsx",
      "hooks/use-pwa-install.ts",
      "hooks/use-horizontal-mode-swipe.ts",
      "lib/progress-utils.ts",
      "lib/tracker-cache.ts",
      "lib/modality-utils.ts",
      "lib/link-utils.ts",
      "lib/date-utils.ts",
      "lib/image-preloader.ts",
      "lib/navigation-utils.ts",
    ]),
    readDirRecursive("components/tracker", [".ts", ".tsx"]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function readStatsSources(): string {
  return [
    readFiles([
      "components/stats-modal.tsx",
      "lib/stats-calculations.ts",
      "lib/stats-utils.ts",
    ]),
    readDirRecursive("components/stats", [".ts", ".tsx"]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function readFeedSources(): string {
  return [
    readFiles([
      "components/feed-tab.tsx",
      "components/shared/record-link-badge.tsx",
      "lib/feed-fetcher.ts",
      "lib/feed-filter.ts",
      "lib/feed-sort.ts",
      "lib/link-utils.ts",
      "lib/date-utils.ts",
      "lib/image-preloader.ts",
    ]),
    readDirRecursive("components/feed", [".ts", ".tsx"]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function readSocialSources(): string {
  return [
    readFiles([
      "components/social-tab.tsx",
      "components/layout/app-topbar.tsx",
      "hooks/use-social-connections.ts",
      "hooks/use-pwa-install.ts",
      "hooks/use-horizontal-mode-swipe.ts",
      "lib/progress-utils.ts",
      "lib/social-cache.ts",
      "lib/navigation-utils.ts",
    ]),
    readDirRecursive("components/social", [".ts", ".tsx"]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function readRankingSources(): string {
  return [
    readFiles([
      "components/ranking-tab.tsx",
      "components/layout/app-topbar.tsx",
      "hooks/use-ranking-data.ts",
      "hooks/use-pwa-install.ts",
      "hooks/use-horizontal-mode-swipe.ts",
      "lib/progress-utils.ts",
      "lib/navigation-utils.ts",
    ]),
    readDirRecursive("components/ranking", [".ts", ".tsx"]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function readMapSources(): string {
  return [
    readFiles([
      "components/world-map.tsx",
      "components/spain-map.tsx",
      "components/collective-map.tsx",
      "lib/leaflet-canvas-patch.ts",
      "lib/geo-loader.ts",
      "lib/leaflet-bounds.ts",
      "lib/leaflet-icons.ts",
    ]),
    readDirRecursive("components/maps", [".ts", ".tsx"]),
  ]
    .filter(Boolean)
    .join("\n\n");
}
