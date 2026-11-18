import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("R2_ENDPOINT", "https://acct.r2.cloudflarestorage.com");
  vi.stubEnv("R2_BUCKET", "invites");
  vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY");
});

// Signing is offline, so these check the URLs we hand to browsers without touching R2.
describe("R2 presigned URLs", () => {
  it("binds PUTs to the content type and a short expiry", async () => {
    const { r2Storage } = await import("@/lib/storage/r2");
    const url = new URL(await r2Storage.presignPut("pending/abc/original", "image/png"));
    expect(url.origin + url.pathname).toBe("https://acct.r2.cloudflarestorage.com/invites/pending/abc/original");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same GET URL within a stable window, so browsers can cache it", async () => {
    const { r2Storage } = await import("@/lib/storage/r2");
    const a = await r2Storage.presignGet("templates/t/original", { expiresIn: 600, stableFor: 3600 });
    const b = await r2Storage.presignGet("templates/t/original", { expiresIn: 600, stableFor: 3600 });
    expect(a).toBe(b);
    const url = new URL(a);
    // Signed at the top of the hour, valid for the window plus the requested lifetime.
    expect(url.searchParams.get("X-Amz-Date")).toMatch(/T\d{2}0000Z$/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("4200");
  });

  it("can force a download filename", async () => {
    const { r2Storage } = await import("@/lib/storage/r2");
    const url = new URL(await r2Storage.presignGet("templates/t/original", { downloadName: 'my "invite".png' }));
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="my invite.png"');
  });
});
