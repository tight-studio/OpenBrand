"use client";

import { useState } from "react";
import type { BrandExtractionResult } from "@/src/types";

export function JsonView({ data }: { data: BrandExtractionResult }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto max-h-[600px] overflow-y-auto font-mono leading-relaxed">
        {json}
      </pre>
    </div>
  );
}
