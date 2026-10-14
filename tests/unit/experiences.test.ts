import { describe, it, expect } from "vitest";
import { predefinedCategories } from "@/data/experiences";

describe("Predefined Experiences Dataset Integrity", () => {
  it("should have populated categories with valid metadata", () => {
    expect(predefinedCategories.length).toBeGreaterThan(0);

    for (const cat of predefinedCategories) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(cat.iconName).toBeTruthy();
      expect(cat.experiences.length).toBeGreaterThan(0);
    }
  });

  it("should have globally unique category IDs", () => {
    const catIds = predefinedCategories.map((c) => c.id);
    const uniqueCatIds = new Set(catIds);
    expect(uniqueCatIds.size).toBe(catIds.length);
  });

  it("should have globally unique experience IDs across all categories", () => {
    const expIds: string[] = [];
    for (const cat of predefinedCategories) {
      for (const exp of cat.experiences) {
        expIds.push(exp.id);
      }
    }
    const uniqueExpIds = new Set(expIds);
    expect(uniqueExpIds.size).toBe(expIds.length);
  });

  it("should validate that subItems, if present, have unique ids within their experience", () => {
    for (const cat of predefinedCategories) {
      for (const exp of cat.experiences) {
        if (exp.subItems) {
          expect(exp.subItems.length).toBeGreaterThan(0);
          const subIds = exp.subItems.map((s) => s.id);
          const uniqueSubIds = new Set(subIds);
          expect(uniqueSubIds.size).toBe(subIds.length);
          for (const sub of exp.subItems) {
            expect(sub.name).toBeTruthy();
          }
        }
      }
    }
  });

  it("should ensure all predefined experience IDs start with 'exp-' prefix", () => {
    for (const cat of predefinedCategories) {
      for (const exp of cat.experiences) {
        expect(exp.id.startsWith("exp-")).toBe(true);
      }
    }
  });
});

describe("Experience Modification Safety & Action Buttons Invariants", () => {
  it("should guard summit-tracker.tsx so only custom experiences can show the edit button", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trackerContent = fs.readFileSync(
      path.resolve(__dirname, "../../components/summit-tracker.tsx"),
      "utf-8"
    );

    // Edit button must be conditioned on isCustomExp
    expect(trackerContent).toMatch(
      /\{isCustomExp\s*&&\s*\(\s*<button[\s\S]*?title="Editar experiencia"/
    );

    // Guard in handleSaveCustomExperience against predefined experiences starting with exp-
    expect(trackerContent).toMatch(
      /if\s*\(\s*typeof\s+editingCustomExp\.id\s*===\s*"string"\s*&&\s*editingCustomExp\.id\.startsWith\("exp-"\)\s*\)/
    );
  });

  it("should enforce 22px dimensions and 14px icons for experience action buttons", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trackerContent = fs.readFileSync(
      path.resolve(__dirname, "../../components/summit-tracker.tsx"),
      "utf-8"
    );

    // Buttons should have width and height 22px
    expect(trackerContent).toContain('width: "22px"');
    expect(trackerContent).toContain('height: "22px"');

    // SVGs should have width and height 14px
    expect(trackerContent).toContain('width: 14, height: 14');
    expect(trackerContent).toContain('width="14"');
    expect(trackerContent).toContain('height="14"');
  });

  it("should include MarqueeText and overflow containment to prevent card blowout", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trackerContent = fs.readFileSync(
      path.resolve(__dirname, "../../components/summit-tracker.tsx"),
      "utf-8"
    );
    const globalsCss = fs.readFileSync(
      path.resolve(__dirname, "../../app/globals.css"),
      "utf-8"
    );

    // Tracker uses MarqueeText for experience details and titles
    expect(trackerContent).toContain("<MarqueeText");
    expect(trackerContent).toContain("paddingRight:");
    expect(trackerContent).toMatch(/isCustomExp\s*\?\s*"64px"\s*:\s*"38px"/);

    // globals.css defines marquee keyframes and container overflow: hidden
    expect(globalsCss).toContain(".marquee-text-container");
    expect(globalsCss).toContain("@keyframes marquee-scroll");
    expect(globalsCss).toContain(".peak-list-item .item-info");
    expect(globalsCss).toMatch(/\.peak-list-item\s*\{[^}]*overflow:\s*hidden/);
  });

  it("should guard summit-tracker.tsx so only custom categories show the edit button and predefined categories cannot be modified", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trackerContent = fs.readFileSync(
      path.resolve(__dirname, "../../components/summit-tracker.tsx"),
      "utf-8"
    );

    // Edit button must be conditioned on isCustomCat
    expect(trackerContent).toMatch(
      /\{isCustomCat\s*&&\s*\(\s*<button[\s\S]*?title="Editar categoría"/
    );

    // Predefined category check in handleSaveCustomCategory
    expect(trackerContent).toContain("Las categorías por defecto no se pueden modificar.");
    expect(trackerContent).toMatch(/predefinedCategories\.some\(\s*\(c\)\s*=>\s*c\.id\s*===\s*editingCustomCategory\.id\s*\)/);

    // Predefined categories in dynamicCategories keep their original name and icon
    expect(trackerContent).toMatch(/name:\s*cat\.name/);
    expect(trackerContent).toMatch(/iconName:\s*cat\.iconName/);
  });

  it("should ensure experience panel and record dialog can be closed cleanly via close button", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trackerContent = fs.readFileSync(
      path.resolve(__dirname, "../../components/summit-tracker.tsx"),
      "utf-8"
    );

    // setSelected must clear selectedExperience when passed null
    expect(trackerContent).toContain("setSelectedExperience(null)");
    expect(trackerContent).toMatch(
      /if\s*\(!item\)\s*\{\s*setSelectedPeak\(null\);\s*setSelectedCountry\(null\);\s*setSelectedExperience\(null\);/
    );

    // closePanel must clear selectedExperience explicitly
    expect(trackerContent).toMatch(
      /const closePanel\s*=\s*useCallback\(\(\)\s*=>\s*\{[\s\S]*?setSelectedExperience\(null\);/
    );

    // close buttons in info-panel and record-dialog must have type="button" and IconClose
    expect(trackerContent).toMatch(
      /<aside[\s\S]*?className="info-panel"[\s\S]*?<button[\s\S]*?type="button"[\s\S]*?onClick=\{closePanel\}[\s\S]*?<IconClose/
    );
    expect(trackerContent).toMatch(
      /className="record-dialog"[\s\S]*?<button[\s\S]*?type="button"[\s\S]*?onClick=\{handleCloseRecord\}[\s\S]*?<IconClose/
    );
  });
});


