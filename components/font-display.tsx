"use client";

import type { FontAsset } from "@/src/types";
import { useState } from "react";

export function FontDisplay({ fonts }: { fonts: FontAsset[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  if (fonts.length === 0) return null;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3">
        Fonts
      </h3>
      <div className="flex flex-wrap gap-3">
        {fonts.map((font, i) => (
          <button
            key={i}
            onClick={() => copy(font.family)}
            className="group text-left p-4 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 transition-colors cursor-pointer"
          >
            <span className="block text-base font-semibold text-neutral-900">
              {copied === font.family ? "Copied!" : font.family}
            </span>
            <span className="block mt-1 text-xs text-neutral-400">
              {font.role} · {font.source}
            </span>
            {font.weights.length > 0 && (
              <span className="block mt-0.5 text-[10px] text-neutral-400">
                {font.weights.join(", ")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
