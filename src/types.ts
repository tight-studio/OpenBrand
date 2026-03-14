export interface LogoAsset {
  url: string;
  alt?: string;
  type?: "img" | "svg" | "favicon" | "apple-touch-icon" | "icon" | "logo";
  resolution?: {
    width: number;
    height: number;
    aspect_ratio: number;
  };
}

export interface ColorAsset {
  hex: string;
  usage?: "primary" | "secondary" | "accent" | "background" | "text";
}

export interface BackdropAsset {
  url: string;
  description?: string;
}

export interface FontAsset {
  family: string;
  /** Where to get the font (e.g. Google Fonts specimen or Fontshare page) */
  url?: string;
  /** Direct stylesheet or font file URL from the site (for download / open source) */
  sourceUrl?: string;
}

export interface BrandExtractionResult {
  brandName: string;
  logos: LogoAsset[];
  colors: ColorAsset[];
  backdrops: BackdropAsset[];
  fonts: FontAsset[];
}

export interface ExtractionResponse {
  success: boolean;
  data?: BrandExtractionResult;
  error?: string;
  errorCode?: "ACCESS_BLOCKED" | "NOT_FOUND" | "SERVER_ERROR" | "NETWORK_ERROR" | "EMPTY_CONTENT";
}
