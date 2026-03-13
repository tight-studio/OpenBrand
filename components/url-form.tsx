"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { BrandExtractionResult, ExtractionResponse } from "@/src/types";
import { BrandResults } from "./brand-results";

export function UrlForm({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrandExtractionResult | null>(null);
  const autoTriggered = useRef(false);

  const extract = useCallback(async (targetUrl: string) => {
    setError(null);
    setResult(null);

    let normalized = targetUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("url", normalized);
    window.history.replaceState(null, "", newUrl.toString());

    setLoading(true);
    try {
      const res = await fetch(`/api/extract?url=${encodeURIComponent(normalized)}`);

      const data: ExtractionResponse = await res.json();

      if (!data.success) {
        setError(data.error || "Extraction failed");
        return;
      }

      setResult(data.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialUrl && !autoTriggered.current) {
      autoTriggered.current = true;
      extract(initialUrl);
    }
  }, [initialUrl, extract]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    extract(url);
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter a website URL (e.g. stripe.com, tight.studio)"
          className="flex-1 px-4 py-3 rounded-xl border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-shadow"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-6 py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Extracting...
            </span>
          ) : (
            "Extract"
          )}
        </button>
      </form>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-neutral-400">
          <svg
            className="animate-spin h-8 w-8 mx-auto mb-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p>Analyzing brand assets... this may take up to 30 seconds.</p>
        </div>
      )}

      {result && <BrandResults data={result} />}
    </div>
  );
}
