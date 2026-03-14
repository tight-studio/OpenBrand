"use client";

import type { FontAsset } from "@/src/types";
import Link from "next/link";
import { useState, useEffect } from "react";

const PROMINENT_COUNT = 3;
const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog.";

const GOOGLE_FONTS = "https://fonts.google.com";
const FONTSHARE = "https://www.fontshare.com";
const DAFONTS = "https://www.dafont.com";

function googleSpecimen(family: string): string {
  return `${GOOGLE_FONTS}/specimen/${encodeURIComponent(family).replace(/%20/g, "+")}`;
}
function googleSearch(family: string): string {
  return `${GOOGLE_FONTS}/?query=${encodeURIComponent(family)}`;
}
function fontshareSearch(family: string): string {
  return `${FONTSHARE}/?q=${encodeURIComponent(family)}`;
}
function fontshareFontPage(family: string): string {
  const slug = family.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `${FONTSHARE}/fonts/${slug || "font"}`;
}
function dafontSearch(family: string): string {
  return `${DAFONTS}/search.php?q=${encodeURIComponent(family)}`;
}

function isGoogleFonts(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("fonts.googleapis.com") || u.includes("fonts.gstatic.com");
}

function isFontshare(url: string): boolean {
  return url.toLowerCase().includes("fontshare.com");
}


/** Download font URL: prefer source URL (e.g. abhijee.com/_next/static/fonts/font.woff2) when present. */
function getDownloadFontUrl(font: FontAsset): string {
  const src = font.sourceUrl;
  const page = font.url;
  if (src && !isGoogleFonts(src) && !isFontshare(src)) return src;
  if ((src && isGoogleFonts(src)) || (page && isGoogleFonts(page))) return googleSpecimen(font.family);
  if ((src && isFontshare(src)) || (page && isFontshare(page))) return fontshareFontPage(font.family);
  return googleSearch(font.family);
}

function availableOn(
  url: string | undefined,
): "Google Fonts" | "Fontshare" | "Web" {
  if (!url) return "Web";
  const u = url.toLowerCase();
  if (u.includes("fonts.google.com")) return "Google Fonts";
  if (u.includes("fontshare.com")) return "Fontshare";
  return "Web";
}

function useLoadFontStylesheets(fonts: FontAsset[]) {
  useEffect(() => {
    const list = fonts ?? [];
    if (list.length === 0) return;
    const links: HTMLLinkElement[] = [];

    list.forEach((f) => {
      if (f.url) {
        const u = f.url.toLowerCase();
        if (
          u.includes("fontshare.com") &&
          (u.includes("/css") || u.includes("api."))
        ) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = f.url;
          document.head.appendChild(link);
          links.push(link);
        }
      }
    });

    const families = [...new Set(list.map((f) => f.family))].slice(0, 20);
    const query = families
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`)
      .join("&");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
    document.head.appendChild(link);
    links.push(link);

    return () => links.forEach((l) => l.parentNode?.removeChild(l));
  }, [fonts]);
}

function FontCard({
  font,
  onCopyJson,
  copied,
}: {
  font: FontAsset;
  onCopyJson: () => void;
  copied: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const downloadHref = getDownloadFontUrl(font);
  const availability = availableOn(font.url);
  const copyPayload = {
    family: font.family,
    ...(font.url && { url: font.url }),
    ...(font.sourceUrl && { sourceUrl: font.sourceUrl }),
  };

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <p
        className="text-2xl font-normal leading-snug text-neutral-900 antialiased md:text-[1.35rem]"
        style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }}
      >
        {SAMPLE_TEXT}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-semibold text-neutral-900">
            {font.family}
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {availability}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                JSON.stringify(copyPayload, null, 2),
              );
              onCopyJson();
            }}
            className="rounded-lg px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              aria-expanded={moreOpen}
            >
              More
              <svg
                className="ml-1.5 h-4 w-4 shrink-0 transition-transform"
                style={{ transform: moreOpen ? "rotate(180deg)" : undefined }}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {moreOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Close"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-xl">
                  {font.sourceUrl && (
                    <a
                      href={font.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50"
                    >
                      Open source / Download
                    </a>
                  )}
                  <a
                    href={googleSearch(font.family)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Find on Google Fonts
                  </a>
                  <a
                    href={fontshareSearch(font.family)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Find on Fontshare
                  </a>
                  <a
                    href={dafontSearch(font.family)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Find on DaFont
                  </a>
                </div>
              </>
            )}
          </div>

          <Link
            href={downloadHref}
            target="_blank"
            className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Download font →
          </Link>
        </div>
      </div>
    </article>
  );
}

export function FontList({ fonts }: { fonts: FontAsset[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useLoadFontStylesheets(fonts ?? []);

  const list = fonts ?? [];
  if (list.length === 0) return null;

  const visible = expanded ? list : list.slice(0, PROMINENT_COUNT);
  const hasMore = list.length > PROMINENT_COUNT;

  return (
    <div>
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-neutral-500">
        Fonts
      </h3>
      <div className="space-y-4">
        {visible.map((font, i) => (
          <FontCard
            key={`${font.family}-${i}`}
            font={font}
            onCopyJson={() => {
              setCopiedId(`f-${i}`);
              setTimeout(() => setCopiedId(null), 1500);
            }}
            copied={copiedId === `f-${i}`}
          />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-800"
        >
          {expanded ? "Show less" : `View all ${list.length} fonts`}
          <svg
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
