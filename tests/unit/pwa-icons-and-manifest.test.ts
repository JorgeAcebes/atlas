import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA Manifest, Icons, and Standalone Configuration", () => {
  const rootDir = process.cwd();

  describe("public/manifest.json contract", () => {
    const manifestPath = path.join(rootDir, "public/manifest.json");
    const manifestRaw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    it("should be configured with standalone and window-controls-overlay display modes", () => {
      expect(manifest.display).toBe("standalone");
      expect(manifest.display_override).toContain("standalone");
      expect(manifest.display_override).toContain("window-controls-overlay");
      expect(manifest.start_url).toBe("/");
      expect(manifest.scope).toBe("/");
    });

    it("should declare both 'any' and 'maskable' icons for 192, 512, and 1024 sizes", () => {
      const anyIcons = manifest.icons.filter((i: any) => i.purpose === "any");
      const maskableIcons = manifest.icons.filter((i: any) => i.purpose === "maskable");

      expect(anyIcons.length).toBeGreaterThanOrEqual(3);
      expect(maskableIcons.length).toBeGreaterThanOrEqual(3);

      const anySizes = anyIcons.map((i: any) => i.sizes);
      expect(anySizes).toContain("192x192");
      expect(anySizes).toContain("512x512");
      expect(anySizes).toContain("1024x1024");

      const maskableSizes = maskableIcons.map((i: any) => i.sizes);
      expect(maskableSizes).toContain("192x192");
      expect(maskableSizes).toContain("512x512");
      expect(maskableSizes).toContain("1024x1024");
    });

    it("every icon declared in manifest.json must exist in public directory with non-zero size", () => {
      for (const icon of manifest.icons) {
        const filePath = path.join(rootDir, "public", icon.src.replace(/^\//, ""));
        expect(fs.existsSync(filePath), `Icon ${icon.src} must exist at ${filePath}`).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(500);
      }
    });
  });

  describe("public/sw.js precache integrity", () => {
    const swPath = path.join(rootDir, "public/sw.js");
    const swContent = fs.readFileSync(swPath, "utf8");

    it("should include maskable and any icons in PRECACHE_URLS", () => {
      expect(swContent).toContain("'/icon-1024.png'");
      expect(swContent).toContain("'/icon-512.png'");
      expect(swContent).toContain("'/icon-192.png'");
      expect(swContent).toContain("'/icon-maskable-1024.png'");
      expect(swContent).toContain("'/icon-maskable-512.png'");
      expect(swContent).toContain("'/icon-maskable-192.png'");
      expect(swContent).toContain("'/apple-touch-icon.png'");
    });

    it("should have cache version at v10 or higher", () => {
      expect(swContent).toMatch(/atlas-cache-v(?:1\d|\d{2,})/);
    });
  });

  describe("SVG transparency and proportion compliance", () => {
    it("public/icon-192.svg and public/icon-512.svg must have no background rectangles", () => {
      const icon192 = fs.readFileSync(path.join(rootDir, "public/icon-192.svg"), "utf8");
      const icon512 = fs.readFileSync(path.join(rootDir, "public/icon-512.svg"), "utf8");

      expect(icon192).not.toContain("<rect");
      expect(icon512).not.toContain("<rect");
    });

    it("maskable SVGs must have solid white background", () => {
      const mask192 = fs.readFileSync(path.join(rootDir, "public/icon-maskable-192.svg"), "utf8");
      const mask512 = fs.readFileSync(path.join(rootDir, "public/icon-maskable-512.svg"), "utf8");
      const mask1024 = fs.readFileSync(path.join(rootDir, "public/icon-maskable-1024.svg"), "utf8");

      expect(mask192).toContain('<rect width="192" height="192" fill="#ffffff"');
      expect(mask512).toContain('<rect width="512" height="512" fill="#ffffff"');
      expect(mask1024).toContain('<rect width="1024" height="1024" fill="#ffffff"');
    });
  });

  describe("app/layout.tsx WebApp capabilities and Standalone preservation", () => {
    const layoutPath = path.join(rootDir, "app/layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");

    it("should declare mobile-web-app-capable and application-name meta tags", () => {
      expect(layoutContent).toContain('name="mobile-web-app-capable" content="yes"');
      expect(layoutContent).toContain('name="application-name" content="Atlas"');
    });

    it("should have robust isStandalone detection including matchMedia and referrer", () => {
      expect(layoutContent).toContain("display-mode: standalone");
      expect(layoutContent).toContain("display-mode: fullscreen");
      expect(layoutContent).toContain("android-app://");
    });

    it("should provide explicit sizes for favicon.ico and high-res icon in head", () => {
      expect(layoutContent).toContain('url: "/icon-512.png", sizes: "512x512"');
      expect(layoutContent).toContain('sizes: "16x16 32x32 48x48"');
      expect(layoutContent).not.toContain('{ url: "/favicon.ico", sizes: "any" }');
    });
  });
});
