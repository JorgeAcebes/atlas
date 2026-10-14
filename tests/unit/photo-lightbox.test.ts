import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PhotoLightbox Invariants and Architecture", () => {
  const rootDir = process.cwd();
  const lightboxPath = path.join(rootDir, "components/photo-lightbox.tsx");
  const content = fs.readFileSync(lightboxPath, "utf-8");

  it("PhotoLightbox must exist and export PhotoLightbox component", () => {
    expect(fs.existsSync(lightboxPath)).toBe(true);
    expect(content).toContain("export function PhotoLightbox");
  });

  it("PhotoLightbox must NOT close on backdrop click to prevent fragile/accidental dismissals", () => {
    // Backdrop must not invoke onClose or window.history.back on backdrop click
    expect(content).not.toMatch(/className="lightbox-backdrop"[^>]*onClick=\{[^}]*onClose/);
    expect(content).not.toMatch(/className="lightbox-backdrop"[^>]*onClick=\{[^}]*history\.back/);
  });

  it("PhotoLightbox must NOT display photo enumeration counters (e.g., 1 de 4, 1 / 4)", () => {
    expect(content).not.toContain("{currentIndex + 1} / {photos.length}");
    expect(content).not.toContain("1 de 4");
    expect(content).not.toContain("1 / 4");
  });

  it("PhotoLightbox must NOT display visual zoom buttons/pills on screen", () => {
    expect(content).not.toContain("<ZoomIn");
    expect(content).not.toContain("<ZoomOut");
    expect(content).not.toContain("lightbox-zoom-controls");
  });

  it("PhotoLightbox must preserve gesture/wheel/shortcut zoom capabilities", () => {
    expect(content).toContain("handleZoomIn");
    expect(content).toContain("handleZoomOut");
    expect(content).toContain("scale");
    expect(content).toContain("clampPan");
    expect(content).toContain("onWheel");
    expect(content).toContain("handleDoubleTap");
    expect(content).toContain("pinchDistRef");
    expect(content).toContain("isDraggingRef");
  });

  it("PhotoLightbox must keep image height well above bottom info card", () => {
    expect(content).toContain("100dvh - 210px");
    expect(content).toContain("lightbox-info-card");
  });

  it("Invariant 11.6: PhotoLightbox must not display dates or concatenate dates in the photo captions or location title", () => {
    expect(content).not.toContain("taken_on");
    expect(content).not.toContain("formatShortDate");
    expect(content).not.toContain("formatDate");
  });

  it("PhotoLightbox must close explicitly via close button (lightbox-close) in top-right and Escape key", () => {
    expect(content).toContain("className=\"lightbox-close\"");
    expect(content).toContain("e.key === \"Escape\"");
    expect(content).toContain("onClose()");
  });

  it("PhotoLightbox close button must have dark background matching side navigation buttons", () => {
    // Both lightbox-close and lightbox-nav must use dark translucent background
    expect(content).toContain("rgba(0, 0, 0, 0.6)");
  });

  it("PhotoLightbox bottom info area must NOT render a visible card box and must render white text", () => {
    expect(content).toContain('background: "transparent"');
    expect(content).toContain('color: "#ffffff"');
  });

  it("PhotoEditor and Caption modal must portal over PhotoLightbox with zIndex > 99999", () => {
    const editorPath = path.join(rootDir, "components/photo-editor.tsx");
    const editorContent = fs.readFileSync(editorPath, "utf-8");
    expect(editorContent).toContain("createPortal");
    expect(editorContent).toContain("zIndex: 100050");

    const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
    const trackerContent = fs.readFileSync(trackerPath, "utf-8");
    expect(trackerContent).toContain("lightboxCaptionModalOpen &&");
    expect(trackerContent).toContain("createPortal");
    expect(trackerContent).toContain("zIndex: 100050");

    const confirmPath = path.join(rootDir, "components/confirm-modal.tsx");
    const confirmContent = fs.readFileSync(confirmPath, "utf-8");
    expect(confirmContent).toContain("createPortal");
    expect(confirmContent).toContain("zIndex: 100060");
  });

  it("PhotoLightbox must support Twitter-style double-tap zoom to 2.5x and toggle back to 1x", () => {
    // Stage must handle double click / double tap
    expect(content).toContain("handleDoubleTap");
    expect(content).toContain("const targetScale = 2.5");
    expect(content).toContain("touchStartPosRef");
    expect(content).toContain("isCleanTap");
    // Must zoom to 2.5 on first double tap, then toggle to 1x on second double tap
    expect(content).toContain("if (scaleRef.current > 1.05)");
    expect(content).toContain("handleResetZoom()");
  });

  it("PhotoLightbox must implement Google Photos double-tap to zoom with configurable parameters and smooth transition", () => {
    expect(content).toContain("GOOGLE_PHOTOS_ZOOM_CONFIG");
    expect(content).toContain("animationDurationMs");
    expect(content).toContain("animationEasing");
    expect(content).toContain("dragThresholdPx");
    expect(content).toContain("doubleTapDelayMs");
    expect(content).toContain("doubleTapCooldownMs");
    expect(content).toContain("lastDoubleTapTimeRef");
    expect(content).toContain("imageRef");
    expect(content).toContain("ref={imageRef}");
  });

  it("CollectiveMap must NOT render a tooltip inside the peak Marker and must open selectedSummit panel on click", () => {
    const collectivePath = path.join(rootDir, "components/collective-map.tsx");
    const collectiveContent = fs.readFileSync(collectivePath, "utf-8");

    // Must not have Tooltip inside peak markers block
    const uniquePeaksBlock = collectiveContent.slice(
      collectiveContent.indexOf("uniquePeaks.map"),
      collectiveContent.indexOf("experienceMarkers.map")
    );
    expect(uniquePeaksBlock).not.toContain("<Tooltip");

    // Peak marker click must set selectedSummit matching province click behavior
    expect(uniquePeaksBlock).toContain("setSelectedSummit({ id: peak.id");
  });
});

