import * as cheerio from "cheerio";
import probe from "probe-image-size";
import sharp from "sharp";
import type { LogoAsset, ColorAsset, BackdropAsset } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MIN_BODY_LENGTH = 500;

export async function extractBrandAssets(url: string) {
  let html = await fetchPage(url);

  const $ = cheerio.load(html);
  const bodyText = $("body").text().trim();

  if (bodyText.length < MIN_BODY_LENGTH) {
    const jinaHtml = await fetchViaJina(url);
    if (!jinaHtml) return null;
    html = jinaHtml;
  }

  return parseHtml(html, url);
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  return res.text();
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
  brand_name: string;
}> {
  const $ = cheerio.load(html);
  const domainName = getDomainName(baseUrl);

  const logos = await extractLogos($, baseUrl, domainName);
  const colors = await extractColors($, baseUrl, logos);

  return {
    logos,
    colors,
    backdrop_images: extractBackdrops($, html, baseUrl),
    brand_name: extractBrandName($, domainName),
  };
}

// ── Logos ─────────────────────────────────────────────────────────────

async function extractLogos(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  domainName: string
): Promise<LogoAsset[]> {
  const logos: LogoAsset[] = [];
  const seen = new Set<string>();

  function add(
    url: string | null,
    alt: string | undefined,
    type: LogoAsset["type"]
  ) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    logos.push({ url, alt, type });
  }

  // Favicons
  $('link[rel="icon"], link[rel="shortcut icon"]').each((_, el) => {
    add(resolveUrl($(el).attr("href"), baseUrl), undefined, "favicon");
  });

  // Apple touch icons
  $(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  ).each((_, el) => {
    add(
      resolveUrl($(el).attr("href"), baseUrl),
      undefined,
      "apple-touch-icon"
    );
  });

  // <img> with "logo" in attributes — but only the SITE'S OWN logo
  // Strategy: only pick images inside header/nav, or whose src contains the domain name
  $("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = $(el).attr("alt") || "";
    const cls = $(el).attr("class") || "";
    const id = $(el).attr("id") || "";
    const combined = `${src} ${alt} ${cls} ${id}`.toLowerCase();

    if (!combined.includes("logo")) return;

    // Accept if: inside header/nav, or filename contains the site's domain name
    const isInHeader = $(el).closest("header, nav, [role='banner']").length > 0;
    const isInFooter = $(el).closest("footer").length > 0;
    const srcContainsDomain =
      domainName && src.toLowerCase().includes(domainName);
    const altContainsDomain =
      domainName && alt.toLowerCase().includes(domainName);

    if (isInHeader || isInFooter || srcContainsDomain || altContainsDomain) {
      add(resolveUrl(src, baseUrl), alt || undefined, "img");
    }
  });

  // SVGs inside logo-like containers in header/nav/footer only
  $("header, nav, footer, [role='banner']")
    .find('[class*="logo"], [id*="logo"], [aria-label*="logo"]')
    .each((_, el) => {
      const svg = $(el).find("svg").first();
      if (svg.length) {
        const svgHtml = $.html(svg);
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString("base64")}`;
        add(dataUri, undefined, "svg");
      }
    });

  // Probe dimensions for all non-data-URI logos
  await Promise.all(
    logos.map(async (logo) => {
      if (logo.url.startsWith("data:")) return;
      try {
        const result = await probe(logo.url, { timeout: 5000 });
        logo.resolution = {
          width: result.width,
          height: result.height,
          aspect_ratio: +(result.width / result.height).toFixed(2),
        };
      } catch {
        // Keep original type without resolution if probe fails
      }
    })
  );

  // Reclassify img/svg logos based on dimensions
  const filtered = logos.filter((logo) => {
    // Only reclassify img and svg types
    if (logo.type !== "img" && logo.type !== "svg") return true;
    if (!logo.resolution) return true;

    const { width, height, aspect_ratio } = logo.resolution;

    // Remove very large images (likely og:image or hero)
    if (width > 500) return false;

    if (width <= 64 && height <= 64) {
      logo.type = "icon";
    } else if (width <= 256 && aspect_ratio >= 0.8 && aspect_ratio <= 1.2) {
      logo.type = "icon";
    } else if (width <= 256 && aspect_ratio > 1.5) {
      logo.type = "logo";
    } else if (width <= 500 && aspect_ratio > 1.5) {
      logo.type = "logo";
    }

    return true;
  });

  return filtered;
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

function extractBackdrops(
  $: cheerio.CheerioAPI,
  html: string,
  baseUrl: string
): BackdropAsset[] {
  const backdrops: BackdropAsset[] = [];
  const seen = new Set<string>();

  function add(url: string | null, description?: string) {
    if (!url || seen.has(url)) return;
    // Skip tiny assets like gradients, data URIs, or SVG icons
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

  // Large images in hero-like sections only
  $(
    '[class*="hero"] img, [class*="banner"] img, [class*="backdrop"] img, [class*="jumbotron"] img, [class*="splash"] img'
  ).each((_, el) => {
    const src = $(el).attr("src");
    const alt = ($(el).attr("alt") || "").toLowerCase();
    const cls = ($(el).attr("class") || "").toLowerCase();
    if (alt.includes("logo") || cls.includes("logo")) return;

    add(resolveUrl(src, baseUrl), "Hero/banner image");
  });

  return backdrops;
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
