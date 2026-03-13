import { describe, test, expect } from "bun:test";
import { extractBrandAssets } from "../src";

describe("extractBrandAssets", () => {
  test("extracts brand assets from a real website", async () => {
    const result = await extractBrandAssets("https://example.com");

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("brand_name");
    expect(result).toHaveProperty("logos");
    expect(result).toHaveProperty("colors");
    expect(result).toHaveProperty("backdrop_images");

    expect(typeof result!.brand_name).toBe("string");
    expect(Array.isArray(result!.logos)).toBe(true);
    expect(Array.isArray(result!.colors)).toBe(true);
    expect(Array.isArray(result!.backdrop_images)).toBe(true);
  }, 15000);
});
