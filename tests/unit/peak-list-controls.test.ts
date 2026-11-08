import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Peak & Country List Header Simplification & Search Alignment", () => {
  const rootDir = process.cwd();
  const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
  const trackerContent = fs.readFileSync(trackerPath, "utf-8");
  const cssPath = path.join(rootDir, "app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("1. Slogans and redundant titles are completely eliminated from all list modes", () => {
    // Slogans removed
    expect(trackerContent).not.toContain("Ordenados alfabéticamente");
    expect(trackerContent).not.toContain("Ordenadas por altitud");
    expect(trackerContent).not.toContain("Agrupadas por categoría");

    // Titles removed
    expect(trackerContent).not.toContain("Todos los países");
    expect(trackerContent).not.toContain("Todas las cumbres");
    expect(trackerContent).not.toContain("Todas tus experiencias");
    expect(trackerContent).not.toContain("Todas sus experiencias");

    // Eyebrows / variables removed
    expect(trackerContent).not.toContain("modeListEyebrow");
    expect(trackerContent).not.toContain("modeListTitle");
    expect(trackerContent).not.toContain("modeListSubtitle");
  });

  it("2. Filter pills and search input are unified inside peak-list-controls", () => {
    expect(trackerContent).toContain('className="peak-list-controls"');
    expect(trackerContent).toContain('className="list-filters"');
    expect(trackerContent).toContain('className="search-input-container"');

    // Both should be children of peak-list-controls
    const controlsRegex = /<div className="peak-list-controls">[\s\S]*?<div[\s\S]*?className="list-filters"[\s\S]*?<div className="search-input-container">[\s\S]*?<\/div>[\s\S]*?<\/div>/;
    expect(trackerContent).toMatch(controlsRegex);
  });

  it("3. globals.css aligns search box centered to the right on desktop and stacked on mobile", () => {
    expect(cssContent).toContain(".peak-list-controls");
    expect(cssContent).toContain("justify-content: space-between");
    expect(cssContent).toContain("align-items: center");

    // Search input aligned to the right without upper margin offset
    expect(cssContent).toMatch(/\.peak-list-controls\s+\.search-input-container[\s\S]*?margin-top:\s*0/);
    expect(cssContent).toMatch(/\.peak-list-controls\s+\.search-input-container[\s\S]*?margin-left:\s*auto/);

    // Mobile layout: column layout with full-width search input
    expect(cssContent).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.peak-list-controls\s*\{[\s\S]*?flex-direction:\s*column/);
    expect(cssContent).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.peak-list-controls\s+\.search-input-container\s*\{[\s\S]*?order:\s*-1/);
  });
});
