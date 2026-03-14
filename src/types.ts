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

export interface BrandExtractionResult {
  brandName: string;
  logos: LogoAsset[];
  colors: ColorAsset[];
  backdrops: BackdropAsset[];
}

export interface ExtractionResponse {
  success: boolean;
  data?: BrandExtractionResult;
  error?: string;
  errorCode?: "ACCESS_BLOCKED" | "NOT_FOUND" | "SERVER_ERROR" | "NETWORK_ERROR" | "EMPTY_CONTENT";
}
