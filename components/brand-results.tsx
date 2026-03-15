"use client";

import { useState } from "react";
import type { BrandExtractionResult } from "@/src/types";
import { ColorPalette } from "./color-palette";
import { LogoDisplay } from "./logo-display";
import { BackdropGallery } from "./backdrop-gallery";
import { FontDisplay } from "./font-display";
import { JsonView } from "./json-view";

export function BrandResults({ data }: { data: BrandExtractionResult }) {
  const [view, setView] = useState<"visual" | "json">("visual");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        {data.brandName ? (
          <h2 className="text-2xl font-semibold text-neutral-900">
            {data.brandName}
          </h2>
        ) : (
          <div />
        )}
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
          <FontDisplay fonts={data.fonts} />
          <BackdropGallery backdrops={data.backdrops} />
        </>
      ) : (
        <JsonView data={data} />
      )}
    </div>
  );
}
