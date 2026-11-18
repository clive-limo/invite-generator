/** Shared by the browser-side ingest and the server-side checks. */
export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  /** iOS Safari's canvas limit; also the server-side cap. */
  maxPixels: 16_777_216,
  /** Below this on the long side we warn that print quality may suffer. */
  recommendedMinSide: 1800,
  previewMaxSide: 1600,
  thumbMaxSide: 480,
  acceptedTypes: ["image/png", "image/jpeg", "image/webp"] as const,
} as const;
