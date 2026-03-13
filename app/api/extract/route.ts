import { type NextRequest, NextResponse } from "next/server";
import { extractBrandAssets } from "@/src/scraper";
import { getAuthenticatedUserId } from "@/lib/auth";
import type { BrandExtractionResult, ExtractionResponse } from "@/src/types";
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
    const source = userId ? (hasBearer ? "api_key" : "session") : "anonymous";

    console.log(JSON.stringify({ event: "extract_request", url, source, user_id: userId, timestamp: new Date().toISOString() }));

    const extracted = await extractBrandAssets(url);

    if (!extracted) {
      console.log(JSON.stringify({ event: "extract_empty", url, source, user_id: userId }));
      return NextResponse.json(
        {
          success: false,
          error: "Could not extract any brand assets from this URL",
        } satisfies ExtractionResponse,
        { status: 422 }
      );
    }

    const result: BrandExtractionResult = {
      brandName: extracted.brand_name || "",
      logos: extracted.logos || [],
      colors: extracted.colors || [],
      backdrops: extracted.backdrop_images || [],
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
    }));

    return NextResponse.json({
      success: true,
      data: result,
    } satisfies ExtractionResponse);
  } catch (error) {
    console.error(JSON.stringify({
      event: "extract_error",
      url: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies ExtractionResponse,
      { status: 500 }
    );
  }
}
