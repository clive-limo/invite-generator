import "server-only";
import { AwsClient } from "aws4fetch";
import type { PresignGetOptions, Storage } from "./types";

/**
 * Cloudflare R2 over its S3-compatible API, signed with aws4fetch (no AWS SDK).
 * Path-style URLs: {R2_ENDPOINT}/{R2_BUCKET}/{key}. R2_ENDPOINT is
 * https://<account-id>.r2.cloudflarestorage.com (or a local MinIO for offline dev).
 */

function config() {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 is not configured: set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
  }
  return { endpoint: endpoint.replace(/\/+$/, ""), bucket, accessKeyId, secretAccessKey };
}

let client: AwsClient | null = null;
function r2() {
  const { accessKeyId, secretAccessKey } = config();
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return client;
}

function objectUrl(key: string): URL {
  const { endpoint, bucket } = config();
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`${endpoint}/${bucket}/${path}`);
}

/** aws4fetch wants the signing time as YYYYMMDDTHHMMSSZ. */
function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** A presigned PUT. The browser must send exactly `contentType`. */
async function presignPut(key: string, contentType: string, expiresIn = 600): Promise<string> {
  const url = objectUrl(key);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await r2().sign(url.toString(), {
    method: "PUT",
    headers: { "content-type": contentType },
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

async function presignGet(key: string, options: PresignGetOptions = {}): Promise<string> {
  const { stableFor, downloadName } = options;
  let { expiresIn = 3600 } = options;
  const url = objectUrl(key);
  let signedAt = new Date();
  if (stableFor) {
    const windowMs = stableFor * 1000;
    signedAt = new Date(Math.floor(signedAt.getTime() / windowMs) * windowMs);
    // Still valid for at least `expiresIn` from now.
    expiresIn += stableFor;
  }
  url.searchParams.set("X-Amz-Expires", String(Math.min(expiresIn, 604800)));
  if (downloadName) {
    url.searchParams.set("response-content-disposition", `attachment; filename="${downloadName.replace(/"/g, "")}"`);
  }
  const signed = await r2().sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true, datetime: amzDate(signedAt) },
  });
  return signed.url;
}

async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const res = await r2().fetch(objectUrl(key).toString(), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${key} failed: ${res.status}`);
  return { size: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") };
}

/** Reads the first `length` bytes of an object (for sniffing image headers). */
async function readObjectStart(key: string, length = 65536): Promise<Uint8Array> {
  const res = await r2().fetch(objectUrl(key).toString(), {
    headers: { range: `bytes=0-${length - 1}` },
  });
  if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Server-side copy; no bytes pass through the function. */
async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const { bucket } = config();
  const source = `/${bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`;
  const res = await r2().fetch(objectUrl(toKey).toString(), {
    method: "PUT",
    headers: { "x-amz-copy-source": source },
  });
  if (!res.ok) throw new Error(`R2 copy ${fromKey} -> ${toKey} failed: ${res.status} ${await res.text()}`);
}

async function deleteObject(key: string): Promise<void> {
  const res = await r2().fetch(objectUrl(key).toString(), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} failed: ${res.status}`);
}

export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_BUCKET);
}

export const r2Storage: Storage = { presignPut, presignGet, headObject, readObjectStart, copyObject, deleteObject };
