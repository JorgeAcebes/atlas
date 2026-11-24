import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  readAllStyles,
  readFeedSources,
  readFile,
  readTrackerSources,
} from "@/tests/utils/source-reader";

describe("PWA Viewport & Zoom Lock and Text Selection Rules", () => {
  const rootDir = process.cwd();

  describe("app/layout.tsx Viewport Metadata", () => {
    it("should configure viewport with maximumScale: 1 and userScalable: false", () => {
      const layoutContent = readFile("app/layout.tsx");

      expect(layoutContent).toContain('themeColor: "#245f52"');
      expect(layoutContent).toContain('width: "device-width"');
      expect(layoutContent).toContain("initialScale: 1");
      expect(layoutContent).toContain("maximumScale: 1");
      expect(layoutContent).toContain("userScalable: false");
    });
  });

  describe("CSS user-select and touch-action invariants in styles", () => {
    const cssContent = readAllStyles();

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
    const lockContent = readFile("components/pwa-zoom-lock.tsx");

    it("should export PwaZoomLock component with use client directive", () => {
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(lockContent).toContain('"use client"');
      expect(lockContent).toContain("export function PwaZoomLock");
    });

    it("should handle WebKit gesturestart and gesturechange with passive: false while relying on passive CSS touch-action for taps/scroll", () => {
      expect(lockContent).toContain('document.addEventListener("gesturestart"');
      expect(lockContent).toContain('document.addEventListener("gesturechange"');
      expect(lockContent).toContain("{ passive: false }");
      // Never attach global blocking touchstart/touchend document listeners
      expect(lockContent).not.toContain('document.addEventListener("touchstart"');
      expect(lockContent).not.toContain('document.addEventListener("touchend"');
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
      const providersContent = readFile("components/providers.tsx");
      expect(providersContent).toContain("<PwaZoomLock />");
    });

    it("should have user-written-text class on notes in feed-tab", () => {
      const feedContent = readFeedSources();
      expect(feedContent).toContain('className="feed-item-notes user-written-text"');
    });

    it("should have user-written-text class on notes in summit-tracker", () => {
      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain('className="record-notes user-written-text"');
    });

    it("should have user-written-text class on captions in photo-lightbox", () => {
      const lightboxContent = readFile("components/photo-lightbox.tsx");
      expect(lightboxContent).toContain('className="lightbox-caption user-written-text"');
    });
  });
});
