import * as cheerio from "cheerio";
import probe from "probe-image-size";
import sharp from "sharp";
import type { LogoAsset, ColorAsset, BackdropAsset, FontAsset } from "./types";

/** Internal shape during extraction; we output only FontAsset (family + url?) */
type InternalFont = {
  family: string;
  sourceUrl?: string;
  source: "google_fonts" | "fontshare" | "private" | "unknown";
};

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
  if (data.logos.length === 0 && data.colors.length === 0 && data.backdrop_images.length === 0 && data.fonts.length === 0) {
    return { ok: false, error: { code: "EMPTY_CONTENT", message: "The page loaded but no brand assets (logos, colors, images, or fonts) were found." } };
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

// ── Fonts ───────────────────────────────────────────────────────────

const FONT_FACE_RE = /@font-face\s*\{([^}]*)\}/gi;
const FONT_FAMILY_RE = /font-family\s*:\s*["']?([^"';}]+)["']?/i;
const FONT_SRC_RE = /src\s*:\s*([^;]+);/i;
const FONT_WEIGHT_RE = /font-weight\s*:\s*([^;]+);/i;
const URL_RE = /url\s*\(\s*["']?([^"')]+)["']?\s*\)/g;
/** Match font-family: "Name", sans-serif or font-family: Name, sans-serif (capture first name) */
const FONT_FAMILY_DECL_RE = /font-family\s*:\s*(?:["']([^"']+)["']|([^,"';}\s][^,"';}]*))/gi;

/** Generic font families – skip when extracting from CSS declarations (CSS keywords + common system stack names) */
const GENERIC_FAMILIES = new Set(
  [
    "inherit", "initial", "unset",
    "serif", "sans-serif", "monospace", "cursive", "fantasy",
    "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
    "emoji", "math", "fangsong",
  ].map((s) => s.toLowerCase())
);

const MAX_STYLESHEETS_TO_FETCH = 10;
const STYLESHEET_FETCH_TIMEOUT_MS = 4000;

/** Normalize font family: trim, strip quotes, take first in stack, reject generics. */
function normalizeFamily(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "").split(",")[0].trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (GENERIC_FAMILIES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/**
 * Clean build-time/hashed font names for display:
 * __satoshi_e99f3e → Satoshi, __Instrument_Serif_315a98 → Instrument Serif,
 * __Instrument_Serif_Fallback_315a98 → Instrument Serif
 */
function cleanFontFamilyDisplay(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^__+/, "");
  s = s.replace(/_Fallback(?:_[a-f0-9]+)?$/i, "");
  s = s.replace(/_[a-f0-9]{5,}$/i, "");
  s = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return raw;
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Classify font source from URL */
function classifyFontSource(url: string, baseUrl: string): InternalFont["source"] {
  const lower = url.toLowerCase();
  if (lower.includes("fonts.gstatic.com") || lower.includes("fonts.googleapis.com")) return "google_fonts";
  if (lower.includes("fontshare.com") || lower.includes("api.fontshare.com")) return "fontshare";
  if (lower.includes("dafont.com") || lower.includes("fonts.cdnfonts.com")) return "unknown"; // treat as "find on web"
  try {
    const fontUrl = new URL(url, baseUrl);
    const base = new URL(baseUrl);
    if (fontUrl.origin === base.origin) return "private";
  } catch {}
  return "private";
}

/** Extract family names from Google Fonts stylesheet URL (css: family=A|B, css2: family=A&family=B) */
function parseGoogleFontFamilies(href: string): string[] {
  const families: string[] = [];
  try {
    const u = new URL(href, "https://fonts.googleapis.com");
    const params = u.searchParams.getAll("family");
    if (params.length === 0) {
      const single = u.searchParams.get("family");
      if (single) params.push(single);
    }
    for (const familyParam of params) {
      const parts = familyParam.split("|");
      for (const part of parts) {
        const name = part.split(":")[0].trim().replace(/\+/g, " ");
        const norm = normalizeFamily(name);
        if (norm && !families.includes(norm)) families.push(norm);
      }
    }
  } catch {}
  return families;
}

/** Extract font family from Fontshare URL or default to null */
function parseFontshareFamily(href: string): string | null {
  try {
    const u = new URL(href, "https://api.fontshare.com");
    const path = u.pathname.replace(/^\//, "").split("/")[0];
    if (path) return path.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {}
  return null;
}

/** Fetch external stylesheet content (for parsing @font-face and font-family). */
async function fetchStylesheet(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/css,*/*;q=0.1" },
      signal: AbortSignal.timeout(STYLESHEET_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Parse CSS string for @font-face blocks; returns array of InternalFont with cleaned family. */
function parseFontFaceFromCss(css: string, baseUrl: string): InternalFont[] {
  const out: InternalFont[] = [];
  FONT_FACE_RE.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = FONT_FACE_RE.exec(css)) !== null) {
    const decl = block[1];
    const familyMatch = decl.match(FONT_FAMILY_RE);
    const rawFamily = familyMatch
      ? normalizeFamily(familyMatch[1].trim().replace(/^["']|["']$/g, "").split(",")[0].trim())
      : null;
    if (!rawFamily) continue;
    const family = cleanFontFamilyDisplay(rawFamily);

    const srcMatch = decl.match(FONT_SRC_RE);
    let source: InternalFont["source"] = "private";
    let sourceUrl: string | undefined;
    if (srcMatch) {
      URL_RE.lastIndex = 0;
      let urlMatch: RegExpExecArray | null;
      while ((urlMatch = URL_RE.exec(srcMatch[1])) !== null) {
        const url = urlMatch[1].trim();
        if (url.startsWith("data:")) continue;
        const resolved = resolveUrl(url, baseUrl);
        if (resolved) {
          sourceUrl = resolved;
          source = classifyFontSource(resolved, baseUrl);
          break;
        }
      }
    }
    out.push({ family, sourceUrl, source });
  }
  return out;
}

/** Parse CSS string for font-family declarations (first name in stack only). Returns all occurrences for usage counting. */
function parseFontFamilyDeclarationsFromCss(css: string): string[] {
  const families: string[] = [];
  FONT_FAMILY_DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FONT_FAMILY_DECL_RE.exec(css)) !== null) {
    const name = (m[1] ?? m[2] ?? "").trim();
    const norm = normalizeFamily(name);
    if (norm) families.push(norm);
  }
  return families;
}

/** Prefer higher-confidence source when merging (google_fonts > fontshare > private > unknown). */
function sourcePriority(s: InternalFont["source"]): number {
  switch (s) {
    case "google_fonts": return 3;
    case "fontshare": return 2;
    case "private": return 1;
    default: return 0;
  }
}

/** Google Fonts specimen URL for a family name */
function googleFontsSpecimenUrl(family: string): string {
  const slug = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.google.com/specimen/${slug}`;
}

/** Try to resolve font from Google Fonts; returns specimen URL if the font exists. */
async function resolveFontUrlFromGoogle(family: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(family).replace(/%20/g, "+");
    const res = await fetch(
      `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const css = await res.text();
    if (!css.includes("@font-face")) return null;
    return googleFontsSpecimenUrl(family);
  } catch {
    return null;
  }
}

async function extractFonts(
  $: cheerio.CheerioAPI,
  html: string,
  baseUrl: string
): Promise<FontAsset[]> {
  const byFamily = new Map<string, InternalFont>();
  const countByKey = new Map<string, number>();

  function ensureFont(asset: InternalFont) {
    const key = asset.family.toLowerCase();
    const existing = byFamily.get(key);
    if (!existing) {
      byFamily.set(key, asset);
      return;
    }
    const ep = sourcePriority(existing.source);
    const np = sourcePriority(asset.source);
    if (np > ep) {
      byFamily.set(key, asset);
      return;
    }
    if (np < ep) return;
    // Same priority: never overwrite when we'd lose sourceUrl (website font file URL)
    if (existing.sourceUrl && !asset.sourceUrl) return;
    byFamily.set(key, asset);
  }

  function countFont(family: string) {
    const key = family.toLowerCase();
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  // ── 1. Google Fonts & Fontshare from <link> ──
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved) return;
    const lower = resolved.toLowerCase();
    if (lower.includes("fonts.googleapis.com")) {
      const families = parseGoogleFontFamilies(resolved);
      for (const name of families) {
        const family = cleanFontFamilyDisplay(name);
        if (family) {
          ensureFont({ family, sourceUrl: resolved, source: "google_fonts" });
          countFont(family);
        }
      }
    }
    if (lower.includes("fontshare.com") || lower.includes("api.fontshare.com")) {
      const name = parseFontshareFamily(resolved) || "Fontshare font";
      const family = name ? cleanFontFamilyDisplay(name) : null;
      if (family) {
        ensureFont({ family, sourceUrl: resolved, source: "fontshare" });
        countFont(family);
      }
    }
  });

  // ── 2. Inline <style>: @font-face and font-family (count every occurrence) ──
  $("style").each((_, el) => {
    const css = $(el).html() || "";
    for (const asset of parseFontFaceFromCss(css, baseUrl)) {
      ensureFont(asset);
      countFont(asset.family);
    }
    for (const name of parseFontFamilyDeclarationsFromCss(css)) {
      const family = cleanFontFamilyDisplay(name);
      ensureFont({ family, source: "unknown" });
      countFont(family);
    }
  });

  // ── 3. Collect external stylesheet URLs ──
  const urlSet = new Set<string>();
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved || resolved.startsWith("data:")) return;
    const lower = resolved.toLowerCase();
    if (lower.includes("fonts.googleapis.com") || lower.includes("fontshare.com")) return;
    urlSet.add(resolved);
  });
  const IMPORT_RE = /@import\s+(?:url\s*\(\s*["']?([^"')]+)["']?\s*\)|["']([^"']+)["'])\s*;?/gi;
  $("style").each((_, el) => {
    const css = $(el).html() || "";
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(css)) !== null) {
      const url = m[1] ?? m[2];
      if (!url) continue;
      const resolved = resolveUrl(url.trim(), baseUrl);
      if (resolved && !resolved.startsWith("data:")) urlSet.add(resolved);
    }
  });
  const toFetch = Array.from(urlSet).slice(0, MAX_STYLESHEETS_TO_FETCH);

  // ── 4. Fetch and parse external stylesheets (resolve font URLs against stylesheet URL so /_next/static/fonts/font.woff2 works) ──
  const fetched = await Promise.allSettled(toFetch.map((url) => fetchStylesheet(url)));
  fetched.forEach((result, i) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const css = result.value;
    const stylesheetBaseUrl = toFetch[i] ?? baseUrl;
    for (const asset of parseFontFaceFromCss(css, stylesheetBaseUrl)) {
      ensureFont(asset);
      countFont(asset.family);
    }
    for (const name of parseFontFamilyDeclarationsFromCss(css)) {
      const family = cleanFontFamilyDisplay(name);
      ensureFont({ family, source: "unknown" });
      countFont(family);
    }
  });

  // ── 5. Build FontAsset[] sorted by usage (most used first), with url and sourceUrl ──
  const list = Array.from(byFamily.entries())
    .map(([key, f]) => ({ f, count: countByKey.get(key) ?? 1 }))
    .sort((a, b) => b.count - a.count)
    .map(({ f }) => f);

  const out: FontAsset[] = [];
  for (const f of list) {
    let url: string | undefined;
    if (f.source === "google_fonts") {
      url = googleFontsSpecimenUrl(f.family);
    } else if (f.source === "fontshare" && f.sourceUrl) {
      url = f.sourceUrl;
    } else {
      const resolved = await resolveFontUrlFromGoogle(f.family);
      if (resolved) url = resolved;
    }
    out.push({
      family: f.family,
      ...(url && { url }),
      ...(f.sourceUrl && { sourceUrl: f.sourceUrl }),
    });
  }
  return out;
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
