import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA Viewport & Zoom Lock and Text Selection Rules", () => {
  const rootDir = process.cwd();

  describe("app/layout.tsx Viewport Metadata", () => {
    it("should configure viewport with maximumScale: 1 and userScalable: false", () => {
      const layoutPath = path.join(rootDir, "app/layout.tsx");
      const layoutContent = fs.readFileSync(layoutPath, "utf8");

      expect(layoutContent).toContain('themeColor: "#245f52"');
      expect(layoutContent).toContain('width: "device-width"');
      expect(layoutContent).toContain("initialScale: 1");
      expect(layoutContent).toContain("maximumScale: 1");
      expect(layoutContent).toContain("userScalable: false");
    });
  });

  describe("CSS user-select and touch-action invariants in app/globals.css", () => {
    const cssPath = path.join(rootDir, "app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    it("should have global touch-action: pan-x pan-y and text-size-adjust on html", () => {
      expect(cssContent).toContain("touch-action: pan-x pan-y;");
      expect(cssContent).toContain("-webkit-text-size-adjust: 100%;");
      expect(cssContent).toContain("text-size-adjust: 100%;");
    });

    it("should have global user-select: none on body and explicit exceptions for user-written text", () => {
      expect(cssContent).toContain("-webkit-user-select: none;");
      expect(cssContent).toContain("user-select: none;");

      // Verify exceptions for user-written content & inputs
      expect(cssContent).toContain(".user-written-text");
      expect(cssContent).toContain(".record-notes");
      expect(cssContent).toContain(".feed-item-notes");
      expect(cssContent).toContain(".wishlist-note-display");
      expect(cssContent).toContain(".lightbox-caption");
      expect(cssContent).toContain("figcaption");
      expect(cssContent).toContain("-webkit-user-select: text !important;");
      expect(cssContent).toContain("user-select: text !important;");
    });

    it("should exempt leaflet and lightbox containers with touch-action: none", () => {
      expect(cssContent).toContain(".leaflet-container");
      expect(cssContent).toContain(".lightbox-stage");
      expect(cssContent).toContain("touch-action: none !important;");
    });
  });

  describe("components/pwa-zoom-lock.tsx Component Contract", () => {
    const lockPath = path.join(rootDir, "components/pwa-zoom-lock.tsx");
    const lockContent = fs.readFileSync(lockPath, "utf8");

    it("should export PwaZoomLock component with use client directive", () => {
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(lockContent).toContain('"use client"');
      expect(lockContent).toContain("export function PwaZoomLock");
    });

    it("should handle gesturestart, gesturechange, touchstart, and touchend with passive: false", () => {
      expect(lockContent).toContain('document.addEventListener("gesturestart"');
      expect(lockContent).toContain('document.addEventListener("gesturechange"');
      expect(lockContent).toContain('document.addEventListener("touchstart"');
      expect(lockContent).toContain('document.addEventListener("touchend"');
      expect(lockContent).toContain("{ passive: false }");
    });

    it("should exempt Leaflet and Photo Lightbox from gesture prevention", () => {
      expect(lockContent).toContain(".leaflet-container");
      expect(lockContent).toContain(".lightbox-stage");
      expect(lockContent).toContain(".lightbox-backdrop");
      expect(lockContent).toContain(".lightbox-img-wrapper");
    });
  });

  describe("Integration in Providers and Components", () => {
    it("should mount PwaZoomLock inside Providers", () => {
      const providersPath = path.join(rootDir, "components/providers.tsx");
      const providersContent = fs.readFileSync(providersPath, "utf8");
      expect(providersContent).toContain("<PwaZoomLock />");
    });

    it("should have user-written-text class on notes in feed-tab", () => {
      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const feedContent = fs.readFileSync(feedPath, "utf8");
      expect(feedContent).toContain('className="feed-item-notes user-written-text"');
    });

    it("should have user-written-text class on notes in summit-tracker", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf8");
      expect(trackerContent).toContain('className="record-notes user-written-text"');
    });

    it("should have user-written-text class on captions in photo-lightbox", () => {
      const lightboxPath = path.join(rootDir, "components/photo-lightbox.tsx");
      const lightboxContent = fs.readFileSync(lightboxPath, "utf8");
      expect(lightboxContent).toContain('className="lightbox-caption user-written-text"');
    });
  });
});
