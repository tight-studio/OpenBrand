import { NextResponse } from "next/server";
import { extractBrandAssets } from "@/src/scraper";
import type { BrandExtractionResult, ExtractionResponse } from "@/src/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

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

    console.log(JSON.stringify({ event: "extract_request", url, timestamp: new Date().toISOString() }));

    const extracted = await extractBrandAssets(url);

    if (!extracted) {
      console.log(JSON.stringify({ event: "extract_empty", url }));
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
