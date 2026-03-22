"use client";

import { useState } from "react";
import type { BrandExtractionResult } from "@/src/types";
import { ColorPalette } from "./color-palette";
import { LogoDisplay } from "./logo-display";
import { BackdropGallery } from "./backdrop-gallery";
import { JsonView } from "./json-view";

export function BrandResults({ data }: { data: BrandExtractionResult }) {
  const [view, setView] = useState<"visual" | "json">("visual");
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data.brandName ?? "Brand"} - OpenBrand`, url });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {data.brandName ? (
            <h2 className="text-2xl font-semibold text-neutral-900">
              {data.brandName}
            </h2>
          ) : (
            <div />
          )}
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title="Share result"
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-sm">
          <button
            onClick={() => setView("visual")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              view === "visual"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => setView("json")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              view === "json"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            JSON
          </button>
        </div>
      </div>

      {view === "visual" ? (
        <>
          <LogoDisplay logos={data.logos} />
          <ColorPalette colors={data.colors} />
          <BackdropGallery backdrops={data.backdrops} />
        </>
      ) : (
        <JsonView data={data} />
      )}
    </div>
  );
}
