import type { Field, FieldValues } from "@/lib/fields/schema";

/** What a full-resolution render needs, independent of where it runs. */
export interface RenderJob {
  width: number;
  height: number;
  fields: Field[];
  /** Output pixels per template pixel (1 = native, 2 = 2× export). */
  scale: number;
  dpi: number;
}

/** PNG is the main download and keeps transparency; PDF is a JPEG on a page of the print size. */
export type OutputFormat = "png" | "pdf";

export type WorkerRequest =
  // The original file is sent as a Blob and decoded inside the worker, so the main
  // thread never holds a full-resolution bitmap.
  | { type: "init"; job: RenderJob; source: Blob; origin: string }
  | { type: "render"; id: number; values: FieldValues; format: OutputFormat }
  | { type: "dispose" };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; blob: Blob }
  | { type: "error"; id?: number; message: string };

/** Largest canvas iOS Safari will allocate (width × height). */
export const MAX_CANVAS_PIXELS = 16_777_216;
