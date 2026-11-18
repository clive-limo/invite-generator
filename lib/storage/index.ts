import "server-only";
import { localDiskStorage } from "./local";
import { isR2Configured, r2Storage } from "./r2";
import type { Storage } from "./types";

export type { Storage } from "./types";

export function isLocalStorage(): boolean {
  return !isR2Configured() && process.env.NODE_ENV !== "production";
}

/** R2 when configured; the local dev driver otherwise (never in production). */
export function storage(): Storage {
  if (isR2Configured()) return r2Storage;
  if (process.env.NODE_ENV === "production") throw new Error("R2 storage is not configured");
  return localDiskStorage;
}

export const templateKeys = (templateId: string) => ({
  original: `templates/${templateId}/original`,
  preview: `templates/${templateId}/preview`,
  thumb: `templates/${templateId}/thumb`,
});

export const pendingKeys = (uploadId: string) => ({
  original: `pending/${uploadId}/original`,
  preview: `pending/${uploadId}/preview`,
  thumb: `pending/${uploadId}/thumb`,
});
