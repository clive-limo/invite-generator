import { z } from "zod";
import { errorResponse, handleError, json, readJson, sessionUser } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { randomToken } from "@/lib/security";
import { pendingKeys, storage } from "@/lib/storage";
import { UPLOAD_LIMITS } from "@/lib/upload/limits";

const imageType = z.enum(UPLOAD_LIMITS.acceptedTypes);

const bodySchema = z.object({
  originalType: imageType,
  originalBytes: z.number().int().positive().max(UPLOAD_LIMITS.maxBytes),
  previewType: z.enum(["image/webp", "image/jpeg"]),
  thumbType: z.enum(["image/webp", "image/jpeg"]),
});

/** Presigned PUTs for a new template's original, preview and thumbnail (into pending/). */
export async function POST(request: Request) {
  try {
    const user = await sessionUser(request);
    if (!user) return errorResponse(401, "Sign in to upload templates");
    const body = bodySchema.safeParse(await readJson(request));
    if (!body.success) return errorResponse(400, body.error.issues[0]?.message ?? "Invalid upload");
    const limit = await rateLimit(`upload:${user.id}`, 30, 3600);
    if (!limit.ok) return errorResponse(429, "Too many uploads — try again later", { retryAfter: limit.retryAfter });

    const uploadId = randomToken();
    const keys = pendingKeys(uploadId);
    const [original, preview, thumb] = await Promise.all([
      storage().presignPut(keys.original, body.data.originalType),
      storage().presignPut(keys.preview, body.data.previewType),
      storage().presignPut(keys.thumb, body.data.thumbType),
    ]);
    return json({ uploadId, urls: { original, preview, thumb } });
  } catch (error) {
    return handleError(error);
  }
}
