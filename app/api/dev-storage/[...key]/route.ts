import { NextResponse, type NextRequest } from "next/server";
import { readLocalObject, verifyLocalSignature, writeLocalObject } from "@/lib/storage/local";
import { isLocalStorage } from "@/lib/storage";

// Serves the local development storage driver. Disabled whenever R2 is configured
// or in production.

const MAX_BYTES = 30 * 1024 * 1024;

async function keyFrom(ctx: RouteContext<"/api/dev-storage/[...key]">) {
  const { key } = await ctx.params;
  return key.map(decodeURIComponent).join("/");
}

async function serve(request: NextRequest, ctx: RouteContext<"/api/dev-storage/[...key]">, head: boolean) {
  if (!isLocalStorage()) return new NextResponse(null, { status: 404 });
  const key = await keyFrom(ctx);
  const params = request.nextUrl.searchParams;
  if (params.get("op") !== "get" || !verifyLocalSignature("get", key, params)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const object = await readLocalObject(key);
  if (!object) return new NextResponse("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": object.contentType,
    "content-length": String(object.body.length),
    "cache-control": "private, max-age=3600",
  });
  const download = params.get("dl");
  if (download) headers.set("content-disposition", `attachment; filename="${download.replace(/"/g, "")}"`);
  return new NextResponse(head ? null : new Uint8Array(object.body), { headers });
}

export function GET(request: NextRequest, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  return serve(request, ctx, false);
}

export function HEAD(request: NextRequest, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  return serve(request, ctx, true);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  if (!isLocalStorage()) return new NextResponse(null, { status: 404 });
  const key = await keyFrom(ctx);
  const params = request.nextUrl.searchParams;
  const contentType = request.headers.get("content-type") ?? "";
  if (params.get("op") !== "put" || params.get("ct") !== contentType || !verifyLocalSignature("put", key, params, contentType)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BYTES) return new NextResponse("Too large", { status: 413 });
  await writeLocalObject(key, body, contentType);
  return new NextResponse(null, { status: 200 });
}
