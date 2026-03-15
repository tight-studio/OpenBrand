import { describe, test, expect } from "bun:test";
import { extractBrandAssets } from "../src";

const VALID_LOGO_TYPES = ["img", "svg", "favicon", "apple-touch-icon", "icon", "logo"];
const VALID_COLOR_USAGES = ["primary", "secondary", "accent", "background", "text"];
const VALID_FONT_ROLES = ["heading", "body"];
const VALID_FONT_SOURCES = ["google", "system", "custom"];

describe("asset shape validation", () => {
  // Extract once and share across tests
  let data: Awaited<ReturnType<typeof extractBrandAssets>> extends { ok: true; data: infer D } ? D : never;

  test("extract from github.com for shape tests", async () => {
    const result = await extractBrandAssets("https://github.com");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Extraction failed");
    data = result.data;
  }, 30000);

  test("LogoAsset shape — url is valid, type is known, resolution has correct fields", () => {
    expect(data.logos.length).toBeGreaterThanOrEqual(1);

    for (const logo of data.logos) {
      // url must be a non-empty string (URL or data URI)
      expect(logo.url).toBeString();
      expect(logo.url.length).toBeGreaterThan(0);
      expect(
        logo.url.startsWith("http://") ||
        logo.url.startsWith("https://") ||
        logo.url.startsWith("data:") ||
        logo.url.startsWith("/")
      ).toBe(true);

      // type, if present, must be a known value
      if (logo.type !== undefined) {
        expect(VALID_LOGO_TYPES).toContain(logo.type);
      }

      // resolution, if present, must have numeric width/height/aspect_ratio
      if (logo.resolution !== undefined) {
        expect(typeof logo.resolution.width).toBe("number");
        expect(typeof logo.resolution.height).toBe("number");
        expect(typeof logo.resolution.aspect_ratio).toBe("number");
        expect(logo.resolution.width).toBeGreaterThan(0);
        expect(logo.resolution.height).toBeGreaterThan(0);
        expect(logo.resolution.aspect_ratio).toBeGreaterThan(0);
      }
    }
  });

  test("ColorAsset shape — hex is valid 6-digit, usage is known", () => {
    for (const color of data.colors) {
      expect(color.hex).toMatch(/^#[0-9a-fA-F]{6}$/);

      if (color.usage !== undefined) {
        expect(VALID_COLOR_USAGES).toContain(color.usage);
      }
    }
  });

  test("BackdropAsset shape — url is valid, description is string when present", () => {
    for (const backdrop of data.backdrop_images) {
      expect(backdrop.url).toBeString();
      expect(backdrop.url.length).toBeGreaterThan(0);
      expect(
        backdrop.url.startsWith("http://") ||
        backdrop.url.startsWith("https://") ||
        backdrop.url.startsWith("data:")
      ).toBe(true);

      if (backdrop.description !== undefined) {
        expect(typeof backdrop.description).toBe("string");
      }
    }
  });

  test("FontAsset shape — family is string, role and source are known values", () => {
    // fonts array must exist (may be empty for some sites)
    expect(Array.isArray(data.fonts)).toBe(true);

    for (const font of data.fonts) {
      expect(font.family).toBeString();
      expect(font.family.length).toBeGreaterThan(0);

      expect(VALID_FONT_ROLES).toContain(font.role);
      expect(VALID_FONT_SOURCES).toContain(font.source);

      expect(Array.isArray(font.weights)).toBe(true);
      expect(font.weights.length).toBeGreaterThanOrEqual(1);
      for (const w of font.weights) {
        expect(typeof w).toBe("number");
        expect(w).toBeGreaterThanOrEqual(100);
        expect(w).toBeLessThanOrEqual(900);
      }

      expect(Array.isArray(font.fallbacks)).toBe(true);
      for (const f of font.fallbacks) {
        expect(typeof f).toBe("string");
      }

      if (font.source === "google") {
        expect(font.googleFontsUrl).toBeDefined();
        expect(font.googleFontsUrl).toContain("fonts.googleapis.com");
      }
    }
  });
});
