"use client";

import { downloadZip } from "client-zip";
import { downloadBlob } from "@/lib/download";

export interface ZipPart {
  index: number;
  name: string;
  blob: Blob;
  /** True when it was downloaded automatically; false when it waits for a tap. */
  autoDownloaded: boolean;
}

/**
 * Collects rendered files into ZIP downloads of at most `partBytes` each, so memory
 * stays bounded however long the list is. Most browsers download each part as soon as
 * it's complete; iOS Safari only reliably saves downloads started by a tap, so there
 * parts wait for the person to save them (and generation pauses if two are waiting).
 */
export interface ZipSink {
  add(name: string, blob: Blob): Promise<void>;
  /** Flushes the last part. */
  finish(): Promise<void>;
  abort(): Promise<void>;
  /** Tell the sink a waiting part has been saved, freeing its slot. */
  markSaved(index: number): void;
}

export function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const MAX_WAITING_PARTS = 2;

export function openZipSink(baseName: string, onPart: (part: ZipPart) => void): ZipSink {
  const manual = isIOS();
  const partBytes = (manual ? 100 : 150) * 1024 * 1024;
  let files: { name: string; input: Blob; lastModified: Date }[] = [];
  let size = 0;
  let index = 0;
  const waiting = new Set<number>();
  let slotFreed: (() => void) | null = null;

  async function flush(final: boolean) {
    if (files.length === 0) return;
    // Bound memory: don't build another part while the person has two unsaved.
    while (manual && waiting.size >= MAX_WAITING_PARTS) {
      await new Promise<void>((resolve) => (slotFreed = resolve));
    }
    index += 1;
    const blob = await downloadZip(files).blob();
    // A single-part job gets a plain name; multi-part jobs are numbered.
    const name = final && index === 1 ? `${baseName}.zip` : `${baseName}-part-${index}.zip`;
    if (manual) waiting.add(index);
    else downloadBlob(blob, name);
    onPart({ index, name, blob, autoDownloaded: !manual });
    files = [];
    size = 0;
  }

  return {
    async add(name, blob) {
      if (size + blob.size > partBytes && files.length > 0) await flush(false);
      files.push({ name, input: blob, lastModified: new Date() });
      size += blob.size;
    },
    finish: () => flush(true),
    async abort() {
      files = [];
      size = 0;
      waiting.clear();
      slotFreed?.();
    },
    markSaved(i) {
      waiting.delete(i);
      slotFreed?.();
      slotFreed = null;
    },
  };
}
