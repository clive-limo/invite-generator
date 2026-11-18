import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile, copyFile, open } from "node:fs/promises";
import path from "node:path";
import type { PresignGetOptions, Storage } from "./types";

/**
 * Development-only stand-in for R2: objects live under .data/storage and the
 * "presigned" URLs point at /api/dev-storage, signed with an HMAC so they behave
 * like the real thing (expiry, method, content type). Never used in production.
 */

const ROOT = path.join(process.cwd(), ".data", "storage");

export type LocalOp = "get" | "put";

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? "dev-storage-secret";
}

function filePath(key: string): string {
  const resolved = path.resolve(ROOT, key);
  if (!resolved.startsWith(ROOT + path.sep)) throw new Error("Invalid key");
  return resolved;
}

function signature(op: LocalOp, key: string, expires: number, contentType: string): string {
  return createHmac("sha256", secret()).update(`${op}\n${key}\n${expires}\n${contentType}`).digest("base64url");
}

function signedUrl(op: LocalOp, key: string, expiresIn: number, extra: Record<string, string> = {}, contentType = "") {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const params = new URLSearchParams({ op, exp: String(expires), sig: signature(op, key, expires, contentType), ...extra });
  return `/api/dev-storage/${key.split("/").map(encodeURIComponent).join("/")}?${params}`;
}

export function verifyLocalSignature(op: LocalOp, key: string, params: URLSearchParams, contentType = ""): boolean {
  const expires = Number(params.get("exp"));
  const sig = params.get("sig") ?? "";
  if (!expires || expires < Date.now() / 1000) return false;
  const expected = Buffer.from(signature(op, key, expires, contentType));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function writeLocalObject(key: string, body: Uint8Array, contentType: string) {
  const file = filePath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
}

export async function readLocalObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const file = filePath(key);
    const [body, meta] = await Promise.all([readFile(file), readFile(`${file}.meta.json`, "utf8")]);
    return { body, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
  } catch {
    return null;
  }
}

export const localDiskStorage: Storage = {
  async presignPut(key, contentType, expiresIn = 600) {
    return signedUrl("put", key, expiresIn, { ct: contentType }, contentType);
  },
  async presignGet(key, options: PresignGetOptions = {}) {
    const extra: Record<string, string> = {};
    if (options.downloadName) extra.dl = options.downloadName;
    return signedUrl("get", key, options.expiresIn ?? 3600, extra);
  },
  async headObject(key) {
    try {
      const file = filePath(key);
      const [info, meta] = await Promise.all([stat(file), readFile(`${file}.meta.json`, "utf8")]);
      return { size: info.size, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
    } catch {
      return null;
    }
  },
  async readObjectStart(key, length = 65536) {
    const handle = await open(filePath(key), "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  },
  async copyObject(fromKey, toKey) {
    const to = filePath(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(filePath(fromKey), to);
    await copyFile(`${filePath(fromKey)}.meta.json`, `${to}.meta.json`);
  },
  async deleteObject(key) {
    const file = filePath(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  },
};
