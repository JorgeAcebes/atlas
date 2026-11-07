import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import sharp from "sharp";

describe("PWA Stats Visibility, Maskable Splash Screen & Map Zoom Resilience", () => {
  const rootDir = process.cwd();

  describe("1. PWA Detection & Stats Button Visibility", () => {
    it("isStandalone in components/install-prompt.tsx checks source=pwa and persists to localStorage", () => {
      const code = fs.readFileSync(path.join(rootDir, "components/install-prompt.tsx"), "utf8");
      expect(code).toContain('window.location.search.indexOf("source=pwa") !== -1');
      expect(code).toContain('window.location.search.indexOf("mode=pwa") !== -1');
      expect(code).toContain('localStorage.setItem("pwa_app_installed", "true")');
    });

    it("app/layout.tsx sync script detects source=pwa and persists to localStorage", () => {
      const code = fs.readFileSync(path.join(rootDir, "app/layout.tsx"), "utf8");
      expect(code).toContain("window.location.search.indexOf('source=pwa') !== -1");
      expect(code).toContain("try { localStorage.setItem('pwa_app_installed', 'true'); } catch(e) {}");
    });

    it("components/app-tabs-shell.tsx ensures is-pwa class is preserved on documentElement after hydration", () => {
      const code = fs.readFileSync(path.join(rootDir, "components/app-tabs-shell.tsx"), "utf8");
      expect(code).toContain("isStandalone");
      expect(code).toContain('document.documentElement.classList.add("is-pwa")');
      expect(code).toContain('localStorage.setItem("pwa_app_installed", "true")');
    });

    it("manifest.json defines related_applications for getInstalledRelatedApps support", () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "public/manifest.json"), "utf8"));
      expect(manifest.related_applications).toBeDefined();
      expect(manifest.related_applications.length).toBeGreaterThan(0);
      expect(manifest.related_applications[0].platform).toBe("webapp");
    });
  });

  describe("2. Maskable Splash Screen Icon & Solid Background", () => {
    it("public/icon-maskable-192.png has solid #faf8f1 background (RGB: 250, 248, 241)", async () => {
      const pngPath = path.join(rootDir, "public/icon-maskable-192.png");
      const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(3); // Solid RGB, no transparent alpha
      expect(data[0]).toBe(250); // Red
      expect(data[1]).toBe(248); // Green
      expect(data[2]).toBe(241); // Blue (#faf8f1)
    });

    it("public/icon-maskable-512.png has solid #faf8f1 background matching manifest background_color", async () => {
      const pngPath = path.join(rootDir, "public/icon-maskable-512.png");
      const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(3);
      expect(data[0]).toBe(250);
      expect(data[1]).toBe(248);
      expect(data[2]).toBe(241);
    });

    it("public/apple-touch-icon.png has solid #faf8f1 background", async () => {
      const pngPath = path.join(rootDir, "public/apple-touch-icon.png");
      const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(3);
      expect(data[0]).toBe(250);
      expect(data[1]).toBe(248);
      expect(data[2]).toBe(241);
    });
  });

  describe("3. Map Zoom Displacement Shield & Vector Preload Expansion", () => {
    it("world-map.tsx initializes with explicit renderer (padding: 3.5), center, and zoom", () => {
      const code = fs.readFileSync(path.join(rootDir, "components/world-map.tsx"), "utf8");
      expect(code).toContain("L.canvas({ padding: 3.5 })");
      expect(code).toContain("renderer={canvasRenderer}");
      expect(code).toContain("center={[20, 0]}");
      expect(code).toContain("zoom={2}");
      expect(code).toContain("padding: [0, 0], animate: false");
      expect(code).toContain("isFirstMountRef.current");
    });

    it("spain-map.tsx initializes with explicit renderer (padding: 2.0), center, and zoom", () => {
      const code = fs.readFileSync(path.join(rootDir, "components/spain-map.tsx"), "utf8");
      expect(code).toContain("L.canvas({ padding: 2.0 })");
      expect(code).toContain("renderer={canvasRenderer}");
      expect(code).toContain("center={[40.4168, -3.7038]}");
      expect(code).toContain("zoom={5}");
      expect(code).toContain("padding: [12, 12], animate: false");
      expect(code).toContain("isFirstMountRef.current");
    });

    it("collective-map.tsx initializes with explicit renderer (padding: 3.5) and initial coordinates", () => {
      const code = fs.readFileSync(path.join(rootDir, "components/collective-map.tsx"), "utf8");
      expect(code).toContain("L.canvas({ padding: 3.5 })");
      expect(code).toContain("renderer={canvasRenderer}");
      expect(code).toContain("center={isPeaks ? [40.4168, -3.7038] : [20, 0]}");
      expect(code).toContain("zoom={isPeaks ? 5 : 2}");
      expect(code).toContain("animate: false");
    });
  });
});
