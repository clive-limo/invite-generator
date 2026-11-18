"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FieldValues } from "@/lib/fields/schema";
import type { RowError } from "@/lib/fields/validate";
import { createRenderer, fetchSource, type Renderer } from "@/lib/render/client";
import type { RenderJob } from "@/lib/render/protocol";

export interface ClaimResponse {
  sourceUrl: string;
  job: RenderJob;
  rows: FieldValues[];
}

export class ClaimError extends Error {
  constructor(
    message: string,
    public status: number,
    public rowErrors?: RowError[],
  ) {
    super(message);
  }
}

export async function postClaim(url: string, body: unknown): Promise<ClaimResponse> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ClaimError("You seem to be offline — check your connection and try again", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClaimError(data.error ?? "Something went wrong", res.status, data.rowErrors);
  return data as ClaimResponse;
}

/**
 * Keeps one renderer per template source alive between renders ("Make another"
 * and bulk rows reuse the decoded image), and disposes it on unmount.
 */
export function useRendererCache() {
  const cache = useRef<{ key: string; renderer: Promise<Renderer> } | null>(null);

  useEffect(
    () => () => {
      void cache.current?.renderer.then((r) => r.dispose()).catch(() => undefined);
      cache.current = null;
    },
    [],
  );

  return useCallback(async (claim: ClaimResponse, onDownload?: (fraction: number) => void): Promise<Renderer> => {
    // The signed URL changes hourly, so key on what's actually rendered.
    const key = JSON.stringify([claim.sourceUrl.split("?")[0], claim.job]);
    if (cache.current?.key !== key) {
      void cache.current?.renderer.then((r) => r.dispose()).catch(() => undefined);
      const renderer = fetchSource(claim.sourceUrl, onDownload).then((source) => createRenderer(claim.job, source));
      cache.current = { key, renderer };
      renderer.catch(() => {
        if (cache.current?.key === key) cache.current = null;
      });
    }
    return cache.current.renderer;
  }, []);
}
