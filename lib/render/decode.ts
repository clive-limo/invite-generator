/**
 * createImageBitmap honouring EXIF orientation. Older Safari rejects the
 * "from-image" enum value, so fall back to the default (uploads are normalised to
 * orientation 1 at ingest, so the default is equivalent for stored templates).
 */
export async function decodeImage(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch (error) {
    if (error instanceof TypeError) return createImageBitmap(source);
    throw error;
  }
}
