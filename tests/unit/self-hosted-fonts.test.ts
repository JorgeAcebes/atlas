import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { readFile } from "@/tests/utils/source-reader";

describe("Self-hosted Local Fonts Configuration (Next.js CI Resilience)", () => {
  const expectedFontFiles = [
    "dm-sans-latin.woff2",
    "dm-mono-400-latin.woff2",
    "dm-mono-500-latin.woff2",
    "fraunces-latin.woff2",
    "playfair-display-latin.woff2",
    "playfair-display-italic-latin.woff2",
  ];

  it("app/layout.tsx loads self-hosted fonts via next/font/local instead of next/font/google", () => {
    const layout = readFile("app/layout.tsx");
    expect(layout).toContain('import localFont from "next/font/local"');
    expect(layout).not.toContain("next/font/google");

    for (const cssVar of [
      "--font-dm-sans",
      "--font-dm-mono",
      "--font-fraunces",
      "--font-playfair",
    ]) {
      expect(layout).toContain(cssVar);
    }

    for (const file of expectedFontFiles) {
      expect(layout).toContain(`./fonts/${file}`);
    }
  });

  it("styles/tokens.css consumes all 4 font CSS variables exposed by app/layout.tsx", () => {
    const tokensCss = readFile("styles/tokens.css");
    expect(tokensCss).toContain("--font-dm-sans");
    expect(tokensCss).toContain("--font-dm-mono");
    expect(tokensCss).toContain("--font-fraunces");
    expect(tokensCss).toContain("--font-playfair");
  });

  it("all 6 WOFF2 assets exist in app/fonts/ with valid wOF2 headers and non-trivial byte sizes", () => {
    const fontsDir = path.join(process.cwd(), "app/fonts");
    for (const file of expectedFontFiles) {
      const fullPath = path.join(fontsDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const buf = fs.readFileSync(fullPath);
      expect(buf.length).toBeGreaterThan(10_000);
      expect(buf.subarray(0, 4).toString("ascii")).toBe("wOF2");
    }
  });
});
