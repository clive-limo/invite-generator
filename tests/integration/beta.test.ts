import { afterAll, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Google sign-in has no email route to refuse up front, so these hooks are what keep it closed.
describe("beta allowlist database hooks", () => {
  const stamp = Date.now();
  const stranger = `stranger+${stamp}@not-invited.test`;
  const legacyId = `legacy-${stamp}`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { OR: [{ email: stranger }, { id: legacyId }] } });
  });

  it("refuses to create a user outside the allowlist", async () => {
    const ctx = await auth.$context;
    // As Google sign-in would create them.
    const google = { method: "oauth", oauth: { providerId: "google" } } as const;
    await expect(ctx.internalAdapter.createUser({ email: stranger, name: "Stranger", emailVerified: true }, google)).rejects.toMatchObject({
      body: { code: "BETA_ACCESS_ONLY" },
    });
    expect(await prisma.user.findUnique({ where: { email: stranger } })).toBeNull();
  });

  it("refuses a session to an account from before the beta", async () => {
    await prisma.user.create({ data: { id: legacyId, name: "Legacy", email: `legacy+${stamp}@not-invited.test` } });
    const ctx = await auth.$context;
    await expect(ctx.internalAdapter.createSession(legacyId)).rejects.toMatchObject({ body: { code: "BETA_ACCESS_ONLY" } });
    expect(await prisma.session.count({ where: { userId: legacyId } })).toBe(0);
  });
});
