import { type NextRequest, NextResponse } from "next/server";
import { extractBrandAssets } from "@/src/scraper";
import { getAuthenticatedUserId } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeUrl } from "@/lib/url";
import type { BrandExtractionResult, ExtractionResponse } from "@/src/types";

const CACHE_TTL_DAYS = 30;

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "URL is required" } satisfies ExtractionResponse,
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL" } satisfies ExtractionResponse,
        { status: 400 }
      );
    }

    const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ");
    const userId = await getAuthenticatedUserId(request);

    // If a Bearer token was provided but didn't resolve to a user, reject it
    if (hasBearer && !userId) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" } satisfies ExtractionResponse,
        { status: 401 }
      );
    }

    const source = userId ? (hasBearer ? "api_key" : "session") : "anonymous";
    const normalizedUrl = normalizeUrl(url);
    const supabase = createServiceClient();
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    console.log(JSON.stringify({ event: "extract_request", url, source, user_id: userId, fresh, timestamp: new Date().toISOString() }));

    // Check cache (skip if fresh=true)
    if (!fresh) {
      const cacheThreshold = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from("brand_cache")
        .select("id, result")
        .eq("normalized_url", normalizedUrl)
        .gte("created_at", cacheThreshold)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const result = cached.result as BrandExtractionResult;

        console.log(JSON.stringify({ event: "extract_cache_hit", url, source, user_id: userId, brandName: result.brandName }));

        // Log the cache hit (fire-and-forget)
        supabase
          .from("extraction_logs")
          .insert({
            url,
            normalized_url: normalizedUrl,
            user_id: userId,
            source,
            cache_hit: true,
            success: true,
            brand_cache_id: cached.id,
          })
          .then();

        return NextResponse.json({
          success: true,
          data: result,
        } satisfies ExtractionResponse);
      }
    }

    // Cache miss (or fresh=true): scrape
    const extracted = await extractBrandAssets(url);

    if (!extracted.ok) {
      const { error: extractionError } = extracted;
      console.log(JSON.stringify({ event: "extract_failed", url, source, user_id: userId, error_code: extractionError.code, status: extractionError.status }));

      // Log failed extraction (no brand_cache row)
      supabase
        .from("extraction_logs")
        .insert({
          url,
          normalized_url: normalizedUrl,
          user_id: userId,
          source,
          cache_hit: false,
          success: false,
          error: extractionError.message,
        })
        .then();

      const httpStatus = extractionError.code === "NOT_FOUND" ? 422 : extractionError.code === "EMPTY_CONTENT" ? 422 : 502;
      return NextResponse.json(
        { success: false, error: extractionError.message, errorCode: extractionError.code } satisfies ExtractionResponse,
        { status: httpStatus }
      );
    }

    const result: BrandExtractionResult = {
      brandName: extracted.data.brand_name || "",
      logos: extracted.data.logos || [],
      colors: extracted.data.colors || [],
      backdrops: extracted.data.backdrop_images || [],
      fonts: extracted.data.fonts || [],
    };

    console.log(JSON.stringify({
      event: "extract_success",
      url,
      source,
      user_id: userId,
      brandName: result.brandName,
      logoCount: result.logos.length,
      colorCount: result.colors.length,
      backdropCount: result.backdrops.length,
      fontCount: result.fonts.length,
    }));

    // Insert into brand_cache, then log
    const { data: cacheRow } = await supabase
      .from("brand_cache")
      .insert({ normalized_url: normalizedUrl, result })
      .select("id")
      .single();

    supabase
      .from("extraction_logs")
      .insert({
        url,
        normalized_url: normalizedUrl,
        user_id: userId,
        source,
        cache_hit: false,
        success: true,
        brand_cache_id: cacheRow?.id ?? null,
      })
      .then();

    return NextResponse.json({
      success: true,
      data: result,
    } satisfies ExtractionResponse);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const url = request.nextUrl.searchParams.get("url");

    console.error(JSON.stringify({
      event: "extract_error",
      url: url ?? "unknown",
      error: errorMsg,
    }));

    // Best-effort log — needs url to be meaningful
    if (url) {
      try {
        const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ");
        const userId = await getAuthenticatedUserId(request);
        const source = userId ? (hasBearer ? "api_key" : "session") : "anonymous";
        const supabase = createServiceClient();
        supabase
          .from("extraction_logs")
          .insert({
            url,
            normalized_url: normalizeUrl(url),
            user_id: userId,
            source,
            cache_hit: false,
            success: false,
            error: errorMsg,
          })
          .then();
      } catch {
        // Don't let logging failure mask the original error
      }
    }

    return NextResponse.json(
      { success: false, error: errorMsg } satisfies ExtractionResponse,
      { status: 500 }
    );
  }
}
