import * as cheerio from "cheerio";
import probe from "probe-image-size";
import sharp from "sharp";
import type { LogoAsset, ColorAsset, BackdropAsset, FontAsset } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MIN_BODY_LENGTH = 500;

export type ExtractionError = {
  code: "ACCESS_BLOCKED" | "NOT_FOUND" | "SERVER_ERROR" | "NETWORK_ERROR" | "EMPTY_CONTENT";
  status?: number;
  message: string;
};

export type ExtractionResult =
  | { ok: true; data: Awaited<ReturnType<typeof parseHtml>> }
  | { ok: false; error: ExtractionError };

export async function extractBrandAssets(url: string): Promise<ExtractionResult> {
  const page = await fetchPage(url);

  let html = page.html;
  const $ = cheerio.load(html);
  const bodyText = $("body").text().trim();

  // Fall back to Jina when the direct fetch failed (non-2xx) or returned too little content
  if (!page.ok || bodyText.length < MIN_BODY_LENGTH) {
    const jinaHtml = await fetchViaJina(url);
    if (jinaHtml) {
      html = jinaHtml;
    } else if (!page.ok) {
      // Direct fetch was non-2xx and Jina also failed
      return { ok: false, error: classifyHttpError(page.status) };
    }
  }

  const data = await parseHtml(html, url);
  if (data.logos.length === 0 && data.colors.length === 0 && data.backdrop_images.length === 0) {
    return { ok: false, error: { code: "EMPTY_CONTENT", message: "The page loaded but no brand assets (logos, colors, or images) were found." } };
  }

  return { ok: true, data };
}

function classifyHttpError(status: number): ExtractionError {
  if (status === 403) {
    return {
      code: "ACCESS_BLOCKED",
      status,
      message: "The website blocked the request. This usually means Cloudflare or bot protection is active on the target site - not an issue with your OpenBrand API key.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      status,
      message: "The page was not found on the target website (404).",
    };
  }
  if (status >= 500) {
    return {
      code: "SERVER_ERROR",
      status,
      message: `The target website returned a server error (${status}).`,
    };
  }
  return {
    code: "ACCESS_BLOCKED",
    status,
    message: `The website returned an error (HTTP ${status}) and the fallback fetcher also failed.`,
  };
}

async function fetchPage(url: string): Promise<{ html: string; ok: boolean; status: number }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  return { html: await res.text(), ok: res.ok, status: res.status };
}

async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "text/html",
        "X-Return-Format": "html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function stripQueryParams(url: string): string {
  if (url.startsWith("data:")) return url;
  try {
    const u = new URL(url);
    u.search = "";
    return u.href;
  } catch {
    return url;
  }
}

function resolveUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/** Extract the domain name (without TLD) to identify site-owned assets */
function getDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // "www.klarity.ai" → "klarity"
    const parts = hostname.replace(/^www\./, "").split(".");
    return parts[0].toLowerCase();
  } catch {
    return "";
  }
}

// ── Extraction logic ─────────────────────────────────────────────────

async function parseHtml(
  html: string,
  baseUrl: string
): Promise<{
  logos: LogoAsset[];
  colors: ColorAsset[];
  backdrop_images: BackdropAsset[];
  fonts: FontAsset[];
  brand_name: string;
}> {
  const $ = cheerio.load(html);
  const domainName = getDomainName(baseUrl);

  const { logos, backdrops: imgBackdrops } = await extractImages($, baseUrl, domainName);
  const colors = await extractColors($, baseUrl, logos);
  const cssBackdrops = extractCssBackdrops($, html, baseUrl);
  const fonts = await extractFonts($, html, baseUrl);

  return {
    logos,
    colors,
    backdrop_images: [...cssBackdrops, ...imgBackdrops],
    fonts,
    brand_name: extractBrandName($, domainName),
  };
}

// ── Image extraction & classification ─────────────────────────────────

interface ImageCandidate {
  url: string;
  alt?: string;
  source: "favicon" | "apple-touch-icon" | "img" | "svg";
  location: "header" | "footer" | "body";
  hasLogoHint: boolean;
  hasDomainMatch: boolean;
  isInHeroSection: boolean;
  resolution?: { width: number; height: number; aspect_ratio: number };
}

async function extractImages(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  domainName: string
): Promise<{ logos: LogoAsset[]; backdrops: BackdropAsset[] }> {
  const candidates: ImageCandidate[] = [];
  const seen = new Set<string>();

  function addCandidate(c: Omit<ImageCandidate, "resolution">) {
    if (!c.url) return;
    c.url = stripQueryParams(c.url);
    if (seen.has(c.url)) return;
    seen.add(c.url);
    candidates.push(c);
  }

  // ── Step 1: Collect all image candidates ──

  // Favicons
  $('link[rel="icon"], link[rel="shortcut icon"]').each((_, el) => {
    const url = resolveUrl($(el).attr("href"), baseUrl);
    if (url) addCandidate({ url, source: "favicon", location: "header", hasLogoHint: false, hasDomainMatch: false, isInHeroSection: false });
  });

  // Apple touch icons
  $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_, el) => {
    const url = resolveUrl($(el).attr("href"), baseUrl);
    if (url) addCandidate({ url, source: "apple-touch-icon", location: "header", hasLogoHint: false, hasDomainMatch: false, isInHeroSection: false });
  });

  // All <img> tags
  $("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    const url = resolveUrl(src, baseUrl);
    if (!url) return;

    const alt = $(el).attr("alt") || "";
    const cls = $(el).attr("class") || "";
    const id = $(el).attr("id") || "";
    const combined = `${src} ${alt} ${cls} ${id}`.toLowerCase();

    const isInHeader = $(el).closest("header, nav, [role='banner']").length > 0;
    const isInFooter = $(el).closest("footer").length > 0;
    const location = isInHeader ? "header" : isInFooter ? "footer" : "body";

    const hasLogoHint = combined.includes("logo");
    const hasDomainMatch = !!(
      (domainName && src.toLowerCase().includes(domainName)) ||
      (domainName && alt.toLowerCase().includes(domainName))
    );

    const isInHeroSection = $(el).closest(
      '[class*="hero"], [class*="banner"], [class*="backdrop"], [class*="jumbotron"], [class*="splash"]'
    ).length > 0;

    addCandidate({ url, alt: alt || undefined, source: "img", location, hasLogoHint, hasDomainMatch, isInHeroSection });
  });

  // Inline SVGs in logo-like containers in header/nav
  $("header, nav, [role='banner']")
    .find('[class*="logo"], [id*="logo"], [aria-label*="logo"]')
    .each((_, el) => {
      const svg = $(el).find("svg").first();
      if (svg.length) {
        const svgHtml = $.html(svg);
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString("base64")}`;
        addCandidate({ url: dataUri, source: "svg", location: "header", hasLogoHint: true, hasDomainMatch: false, isInHeroSection: false });
      }
    });

  // ── Step 2: Probe dimensions ──
  await Promise.all(
    candidates.map(async (c) => {
      if (c.url.startsWith("data:")) return;
      try {
        const result = await probe(c.url, { timeout: 5000 });
        c.resolution = {
          width: result.width,
          height: result.height,
          aspect_ratio: +(result.width / result.height).toFixed(2),
        };
      } catch {}
    })
  );

  // ── Step 3: Classify into logos vs backdrops (two-pass) ──
  const logos: LogoAsset[] = [];
  const backdrops: BackdropAsset[] = [];

  // ── Pass 1: High-confidence logos + all backdrops ──
  for (const c of candidates) {
    const width = c.resolution?.width;
    const height = c.resolution?.height;
    const ar = c.resolution?.aspect_ratio;

    // Favicons → always logo
    if (c.source === "favicon") {
      logos.push({ url: c.url, alt: c.alt, type: "favicon", resolution: c.resolution });
      continue;
    }

    // Apple-touch-icons → always logo
    if (c.source === "apple-touch-icon") {
      logos.push({ url: c.url, alt: c.alt, type: "apple-touch-icon", resolution: c.resolution });
      continue;
    }

    // Inline SVG from header/nav → always logo
    if (c.source === "svg") {
      logos.push({ url: c.url, alt: c.alt, type: "svg", resolution: c.resolution });
      continue;
    }

    // Header/nav <img> with logo hint or domain match, width ≤ 500 → logo
    if (c.source === "img" && c.location === "header" && (c.hasLogoHint || c.hasDomainMatch)) {
      if (!width || width <= 500) {
        logos.push({ url: c.url, alt: c.alt, type: classifyLogoType(width, height, ar), resolution: c.resolution });
        continue;
      }
    }

    // Hero/banner section, width ≥ 400 → backdrop
    if (c.isInHeroSection && width && width >= 400) {
      backdrops.push({ url: c.url, description: "Hero/banner image" });
      continue;
    }

  }

  // ── Pass 2: Low-confidence logos (only if none found in pass 1) ──
  if (logos.length === 0) {
    for (const c of candidates) {
      if (c.source !== "img") continue;
      const width = c.resolution?.width;
      const height = c.resolution?.height;
      const ar = c.resolution?.aspect_ratio;

      // Footer with logo hint + domain match, width ≤ 500 → logo
      if (c.location === "footer" && c.hasLogoHint && c.hasDomainMatch) {
        if (!width || width <= 500) {
          logos.push({ url: c.url, alt: c.alt, type: classifyLogoType(width, height, ar), resolution: c.resolution });
          continue;
        }
      }

      // Body with logo hint + domain match, width ≤ 500 → logo
      if (c.location === "body" && c.hasLogoHint && c.hasDomainMatch) {
        if (!width || width <= 500) {
          logos.push({ url: c.url, alt: c.alt, type: classifyLogoType(width, height, ar), resolution: c.resolution });
          continue;
        }
      }
    }
  }

  return { logos, backdrops };
}

/** Classify a logo image as icon vs logo based on dimensions */
function classifyLogoType(
  width: number | undefined,
  height: number | undefined,
  aspectRatio: number | undefined
): LogoAsset["type"] {
  if (!width || !height || !aspectRatio) return "img";
  if (width <= 64 && height <= 64) return "icon";
  if (width <= 256 && aspectRatio >= 0.8 && aspectRatio <= 1.2) return "icon";
  if (width <= 500 && aspectRatio > 1.5) return "logo";
  return "img";
}

// ── Colors ───────────────────────────────────────────────────────────

/** Priority order for logo types when extracting brand colors */
const LOGO_COLOR_PRIORITY: LogoAsset["type"][] = [
  "apple-touch-icon",
  "favicon",
  "logo",
  "icon",
  "img",
  "svg",
];

async function extractColors(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  logos: LogoAsset[]
): Promise<ColorAsset[]> {
  // ── Signal 1: theme-color meta tags ──
  const themeColors: string[] = [];
  for (const selector of [
    'meta[name="theme-color"]',
    'meta[name="msapplication-TileColor"]',
  ]) {
    $(selector).each((_, el) => {
      const content = $(el).attr("content")?.trim();
      if (content) {
        const hex = normalizeToHex(content);
        if (hex) themeColors.push(hex);
      }
    });
  }

  // Check manifest.json for theme_color / background_color
  const manifestHref = $('link[rel="manifest"]').attr("href");
  if (manifestHref) {
    const manifestUrl = resolveUrl(manifestHref, baseUrl);
    if (manifestUrl) {
      try {
        const res = await fetch(manifestUrl, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const manifest = await res.json();
          for (const key of ["theme_color", "background_color"]) {
            const val = manifest[key];
            if (val) {
              const hex = normalizeToHex(val);
              if (hex) themeColors.push(hex);
            }
          }
        }
      } catch {
        // Ignore manifest fetch failures
      }
    }
  }

  // ── Signal 2: Dominant colors from logo images ──
  // Sort logos by priority (apple-touch-icon first, then favicon, etc.)
  const sortedLogos = [...logos]
    .filter((l) => !l.url.startsWith("data:"))
    .sort((a, b) => {
      const ai = LOGO_COLOR_PRIORITY.indexOf(a.type ?? "img");
      const bi = LOGO_COLOR_PRIORITY.indexOf(b.type ?? "img");
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  // Extract dominant colors from each logo image
  // Weight by saturation — brand colors have hue, backgrounds don't
  const logoColors = new Map<string, number>();
  await Promise.all(
    sortedLogos.map(async (logo) => {
      try {
        const res = await fetch(logo.url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        const { data, info } = await sharp(buf)
          .resize(16, 16, { fit: "cover", kernel: "nearest" })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        for (let i = 0; i < data.length; i += info.channels) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const hex = rgbToHex(r, g, b);
          // Weight by saturation: more saturated = more likely brand color
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const weight = 1 + saturation * 3; // 1x–4x based on saturation
          logoColors.set(hex, (logoColors.get(hex) || 0) + weight);
        }
      } catch {
        // Skip logos that fail to fetch/process
      }
    })
  );

  // Split into chromatic (saturated) and achromatic (gray/black/white) colors
  const chromatic: [string, number][] = [];
  const achromatic: [string, number][] = [];
  for (const [hex, weight] of logoColors.entries()) {
    const [r, g, b] = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation > 0.1) {
      chromatic.push([hex, weight]);
    } else {
      achromatic.push([hex, weight]);
    }
  }

  // Sort each group by weight, deduplicate
  chromatic.sort((a, b) => b[1] - a[1]);
  achromatic.sort((a, b) => b[1] - a[1]);

  // Prefer chromatic colors first, fill remaining with achromatic
  const sorted = [
    ...chromatic.map(([hex]) => hex),
    ...achromatic.map(([hex]) => hex),
  ];
  const deduped = deduplicateColors(sorted);

  // ── Combine: theme-color first, then logo-derived colors ──
  const ranked: string[] = [];
  for (const hex of themeColors) {
    const norm = normalizeHex(hex);
    if (!ranked.some((r) => areColorsSimilar(r, norm))) {
      ranked.push(norm);
    }
  }
  for (const hex of deduped) {
    if (ranked.length >= 3) break;
    if (!ranked.some((r) => areColorsSimilar(r, hex))) {
      ranked.push(hex);
    }
  }

  const usageLabels: ColorAsset["usage"][] = ["primary", "secondary", "accent"];
  return ranked.slice(0, 3).map((hex, i) => ({ hex, usage: usageLabels[i] }));
}

/** Remove colors that are too similar (RGB distance < 30) */
function deduplicateColors(colors: string[]): string[] {
  const result: string[] = [];
  for (const hex of colors) {
    if (!result.some((r) => areColorsSimilar(r, hex))) {
      result.push(hex);
    }
  }
  return result;
}

function areColorsSimilar(a: string, b: string, threshold = 50): boolean {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const dist = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  return dist < threshold;
}

function hexToRgb(hex: string): [number, number, number] {
  const norm = normalizeHex(hex);
  const n = parseInt(norm.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function normalizeHex(hex: string): string {
  let h = hex.toLowerCase();
  // Expand 3-digit hex to 6-digit
  if (h.length === 4) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h;
}

function normalizeToHex(color: string): string | null {
  const trimmed = color.trim().toLowerCase();
  // Already hex
  if (/^#([0-9a-f]{3}){1,2}$/i.test(trimmed)) {
    return normalizeHex(trimmed);
  }
  // rgb(r, g, b)
  const rgbMatch = trimmed.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return rgbToHex(+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]);
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ── Backdrops ────────────────────────────────────────────────────────

const BG_IMAGE_RE =
  /background(?:-image)?\s*:[^;]*url\(["']?([^"')]+)["']?\)/gi;

/** Extract non-<img> backdrop images: og:image and CSS background-image */
function extractCssBackdrops(
  $: cheerio.CheerioAPI,
  html: string,
  baseUrl: string
): BackdropAsset[] {
  const backdrops: BackdropAsset[] = [];
  const seen = new Set<string>();

  function add(rawUrl: string | null, description?: string) {
    if (!rawUrl) return;
    const url = stripQueryParams(rawUrl);
    if (seen.has(url)) return;
    if (url.startsWith("data:") || url.endsWith(".svg")) return;
    seen.add(url);
    backdrops.push({ url, description });
  }

  // og:image meta tags
  $('meta[property="og:image"]').each((_, el) => {
    add(resolveUrl($(el).attr("content"), baseUrl), "Open Graph image");
  });

  // CSS background-image URLs from <style> blocks
  $("style").each((_, el) => {
    const css = $(el).text();
    BG_IMAGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BG_IMAGE_RE.exec(css)) !== null) {
      add(resolveUrl(m[1], baseUrl), "CSS background image");
    }
  });

  // Inline style background-image on any element
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    if (!style.includes("url(")) return;

    BG_IMAGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BG_IMAGE_RE.exec(style)) !== null) {
      add(resolveUrl(m[1], baseUrl), "Background image");
    }
  });

  return backdrops;
}

// ── Fonts ─────────────────────────────────────────────────────────────

const SYSTEM_FONTS = new Set([
  "arial", "helvetica", "helvetica neue", "times new roman", "times",
  "georgia", "verdana", "tahoma", "trebuchet ms", "courier new", "courier",
  "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui",
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "ui-sans-serif",
  "ui-serif", "ui-monospace", "ui-rounded",
]);

const HEADING_SELECTORS = /\bh[1-6]\b/i;
const BODY_SELECTORS = /\b(body|html|p|main|article|\*)\b/i;

interface FontInfo {
  family: string;
  weights: Set<number>;
  isGoogle: boolean;
  googleUrl: string | null;
  fallbacks: string[];
  appliedTo: Set<string>;
}

/** Parse a Google Fonts URL (css or css2 API) into family names and weights */
function parseGoogleFontsUrl(url: string): Array<{ family: string; weights: number[] }> {
  const results: Array<{ family: string; weights: number[] }> = [];
  try {
    const u = new URL(url);
    const families = u.searchParams.getAll("family");
    for (const raw of families) {
      // css2: "Inter:wght@400;700" or "Inter:wght@400..700"
      // css:  "Inter:400,700" or just "Inter"
      const colonIdx = raw.indexOf(":");
      const name = colonIdx === -1 ? raw : raw.slice(0, colonIdx);
      const spec = colonIdx === -1 ? "" : raw.slice(colonIdx + 1);

      const weights: number[] = [];
      // Match numeric weight values
      const weightMatches = spec.match(/\d{3}/g);
      if (weightMatches) {
        for (const w of weightMatches) weights.push(parseInt(w, 10));
      }
      if (weights.length === 0) weights.push(400);

      results.push({ family: name.replace(/\+/g, " "), weights });
    }
  } catch {
    // Malformed URL — skip
  }
  return results;
}

/** Parse a font-family CSS value into [primary, ...fallbacks] */
function parseFontStack(value: string): string[] {
  return value
    .replace(/\s*!important\s*/gi, "")
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function getOrCreateFont(map: Map<string, FontInfo>, family: string): FontInfo {
  const key = family.toLowerCase();
  let info = map.get(key);
  if (!info) {
    info = { family, weights: new Set(), isGoogle: false, googleUrl: null, fallbacks: [], appliedTo: new Set() };
    map.set(key, info);
  }
  return info;
}

async function extractFonts($: cheerio.CheerioAPI, html: string, baseUrl: string): Promise<FontAsset[]> {
  const fonts = new Map<string, FontInfo>();

  // ── Phase A: Google Fonts via <link> tags ──
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    for (const { family, weights } of parseGoogleFontsUrl(href)) {
      const info = getOrCreateFont(fonts, family);
      info.isGoogle = true;
      info.googleUrl = href;
      for (const w of weights) info.weights.add(w);
    }
  });

  // ── Phase B: Google Fonts via @import in <style> ──
  const importRe = /@import\s+url\(["']?(https?:\/\/fonts\.googleapis\.com\/[^"')]+)["']?\)/gi;
  $("style").each((_, el) => {
    const css = $(el).text();
    importRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(css)) !== null) {
      for (const { family, weights } of parseGoogleFontsUrl(m[1])) {
        const info = getOrCreateFont(fonts, family);
        info.isGoogle = true;
        info.googleUrl = m![1];
        for (const w of weights) info.weights.add(w);
      }
    }
  });

  // ── Phase C: Fetch external stylesheets for @font-face and font-family ──
  const cssUrls: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    // Skip Google Fonts (handled in Phase A)
    if (href.includes("fonts.googleapis.com")) return;
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) cssUrls.push(resolved);
  });

  const externalCssTexts = await Promise.all(
    cssUrls.slice(0, 5).map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return "";
        return res.text();
      } catch {
        return "";
      }
    })
  );

  // Combine inline <style> text with external CSS
  const inlineStyleText = $("style").map((_, el) => $(el).text()).get().join("\n");
  const styleText = inlineStyleText + "\n" + externalCssTexts.join("\n");

  // ── Phase D: @font-face declarations ──
  const fontFaceRe = /@font-face\s*\{([^}]+)\}/gi;
  fontFaceRe.lastIndex = 0;
  let ff: RegExpExecArray | null;
  while ((ff = fontFaceRe.exec(styleText)) !== null) {
    const block = ff[1];
    const familyMatch = block.match(/font-family\s*:\s*["']?([^"';]+)/i);
    if (!familyMatch) continue;
    const family = familyMatch[1].trim();
    const info = getOrCreateFont(fonts, family);
    const weightMatch = block.match(/font-weight\s*:\s*(\d{3})/i);
    if (weightMatch) info.weights.add(parseInt(weightMatch[1], 10));
  }

  // ── Phase E: font-family usage in CSS rules ──
  const ruleRe = /([^{}@]+)\{([^}]*font-family\s*:[^}]+)\}/gi;
  ruleRe.lastIndex = 0;
  let rule: RegExpExecArray | null;
  while ((rule = ruleRe.exec(styleText)) !== null) {
    const selector = rule[1].trim();
    const body = rule[2];
    const ffMatch = body.match(/font-family\s*:\s*([^;]+)/i);
    if (!ffMatch) continue;
    const stack = parseFontStack(ffMatch[1]);
    if (stack.length === 0) continue;

    const primary = stack[0];
    const info = getOrCreateFont(fonts, primary);
    info.appliedTo.add(selector);
    // Only set fallbacks if we haven't yet (first occurrence wins)
    if (info.fallbacks.length === 0 && stack.length > 1) {
      info.fallbacks = stack.slice(1);
    }
  }

  // ── Phase F: Inline styles on key elements ──
  $("body, h1, h2, h3, h4, h5, h6, p, main, article").each((_, el) => {
    const style = $(el).attr("style");
    if (!style) return;
    const ffMatch = style.match(/font-family\s*:\s*([^;]+)/i);
    if (!ffMatch) return;
    const stack = parseFontStack(ffMatch[1]);
    if (stack.length === 0) return;
    const tagName = (el as { tagName?: string }).tagName?.toLowerCase() || "";
    const info = getOrCreateFont(fonts, stack[0]);
    info.appliedTo.add(tagName);
    if (info.fallbacks.length === 0 && stack.length > 1) {
      info.fallbacks = stack.slice(1);
    }
  });

  // ── Phase G: Classify and build results ──
  const results: FontAsset[] = [];
  for (const [key, info] of fonts) {
    if (SYSTEM_FONTS.has(key)) continue;
    // Skip CSS variable references, keywords, and empty names
    if (key.startsWith("var(") || key.length === 0) continue;
    if (key === "inherit" || key === "initial" || key === "unset" || key === "revert") continue;

    // Determine source
    let source: FontAsset["source"];
    if (info.isGoogle) {
      source = "google";
    } else if (fonts.has(key) && info.weights.size > 0 && !info.isGoogle) {
      // Has @font-face entries → custom
      source = "custom";
    } else {
      source = "custom";
    }

    // Determine role from selectors
    const selectors = [...info.appliedTo].join(" ");
    const isHeading = HEADING_SELECTORS.test(selectors);
    const isBody = BODY_SELECTORS.test(selectors);

    if (isHeading && isBody) {
      // Same font for both — emit as body
      results.push({
        family: info.family,
        role: "body",
        source,
        weights: [...info.weights].sort((a, b) => a - b),
        ...(info.isGoogle && info.googleUrl ? { googleFontsUrl: info.googleUrl } : {}),
        fallbacks: info.fallbacks,
      });
    } else if (isHeading) {
      results.push({
        family: info.family,
        role: "heading",
        source,
        weights: [...info.weights].sort((a, b) => a - b),
        ...(info.isGoogle && info.googleUrl ? { googleFontsUrl: info.googleUrl } : {}),
        fallbacks: info.fallbacks,
      });
    } else {
      // Default to body
      results.push({
        family: info.family,
        role: "body",
        source,
        weights: [...info.weights].sort((a, b) => a - b),
        ...(info.isGoogle && info.googleUrl ? { googleFontsUrl: info.googleUrl } : {}),
        fallbacks: info.fallbacks,
      });
    }
  }

  // Default weights if empty
  for (const f of results) {
    if (f.weights.length === 0) f.weights = [400];
  }

  // Sort: heading first, then body. Cap at 4.
  results.sort((a, b) => (a.role === "heading" ? -1 : 1) - (b.role === "heading" ? -1 : 1));
  return results.slice(0, 4);
}

// ── Brand name ───────────────────────────────────────────────────────

function extractBrandName(
  $: cheerio.CheerioAPI,
  domainName: string
): string {
  // Prefer og:site_name
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  if (ogSiteName) return ogSiteName.trim();

  // application-name
  const appName = $('meta[name="application-name"]').attr("content");
  if (appName) return appName.trim();

  // Try to extract from logo alt text (often contains brand name)
  const logoAlt = $("header img, nav img")
    .filter((_, el) => {
      const combined = `${$(el).attr("src")} ${$(el).attr("alt")} ${$(el).attr("class")}`.toLowerCase();
      return combined.includes("logo");
    })
    .first()
    .attr("alt");
  if (logoAlt) {
    // Clean "Klarity logo" → "Klarity"
    const cleaned = logoAlt
      .replace(/\s*(logo|icon|image|img)\s*/gi, "")
      .trim();
    if (cleaned) return cleaned;
  }

  // Clean up <title> — take the SHORTEST segment (likely the brand name)
  const title = $("title").text().trim();
  if (title) {
    const segments = title.split(/\s*[|\-—–•·]\s*/);
    if (segments.length > 1) {
      // Pick the shortest segment — it's usually the brand name
      // e.g. "Transforming Transformation | Klarity" → "Klarity"
      const shortest = segments.reduce((a, b) =>
        a.length <= b.length ? a : b
      );
      return shortest.trim();
    }
    return segments[0].trim();
  }

  // Fall back to domain name capitalized
  if (domainName) {
    return domainName.charAt(0).toUpperCase() + domainName.slice(1);
  }

  return "";
}
