import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimViaLink } from "@/lib/claims";
import { prisma } from "@/lib/db";
import { defaultTextStyle, type Field } from "@/lib/fields/schema";
import { resolveLink } from "@/lib/templates";

const field: Field = {
  id: "f1",
  key: "guest_name",
  label: "Guest name",
  type: "text",
  multiline: false,
  required: true,
  sampleValue: "Ada",
  maxLength: 40,
  box: { x: 0, y: 0, w: 500, h: 80, rotation: 0 },
  style: defaultTextStyle(1000),
};

const userId = `test-user-${Date.now()}`;

async function makeLink(overrides: { maxGenerations?: number | null; maxBulkRows?: number; enabled?: boolean; expiresAt?: Date | null } = {}) {
  const template = await prisma.template.create({
    data: {
      ownerId: userId,
      name: "Claims test",
      originalKey: "templates/x/original",
      previewKey: "templates/x/preview",
      thumbKey: "templates/x/thumb",
      width: 1000,
      height: 1400,
      previewWidth: 1000,
      previewHeight: 1400,
      mimeType: "image/png",
      bytes: 1,
      draftFields: [field],
    },
  });
  const version = await prisma.templateVersion.create({ data: { templateId: template.id, version: 1, fields: [field] } });
  await prisma.template.update({ where: { id: template.id }, data: { publishedVersionId: version.id } });
  const token = `tok${Math.random().toString(36).slice(2)}${Date.now()}`.slice(0, 22).padEnd(22, "x");
  await prisma.shareLink.create({
    data: {
      templateId: template.id,
      token,
      label: "Test",
      maxGenerations: overrides.maxGenerations ?? null,
      maxBulkRows: overrides.maxBulkRows ?? 200,
      enabled: overrides.enabled ?? true,
      expiresAt: overrides.expiresAt ?? null,
    },
  });
  const resolved = await resolveLink(token);
  if ("problem" in resolved) throw new Error(`link unusable: ${resolved.problem}`);
  return { token, resolved };
}

beforeAll(async () => {
  await prisma.user.create({ data: { id: userId, name: "Claims", email: `${userId}@example.com` } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }); // cascades to templates, links, generations
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "claim:" } } });
  await prisma.$disconnect();
});

describe("claimViaLink", () => {
  it("never over-reserves a link's quota under concurrent claims", async () => {
    const { token, resolved } = await makeLink({ maxGenerations: 5 });
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => claimViaLink(resolved, { mode: "single", values: { guest_name: `Guest ${i}` } }, `ip-${i}`)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.status === 409)).toHaveLength(7);
    const link = await prisma.shareLink.findUniqueOrThrow({ where: { token } });
    expect(link.generationsUsed).toBe(5);
    expect(await prisma.generation.count({ where: { shareLinkId: link.id } })).toBe(5);
  });

  it("doesn't charge the same person twice for the same invite", async () => {
    const { token, resolved } = await makeLink({ maxGenerations: 3 });
    for (let i = 0; i < 3; i++) {
      const result = await claimViaLink(resolved, { mode: "single", values: { guest_name: "Ada" } }, "same-ip");
      expect(result.ok).toBe(true);
    }
    expect((await prisma.shareLink.findUniqueOrThrow({ where: { token } })).generationsUsed).toBe(1);
  });

  it("validates values on the server and returns cleaned rows", async () => {
    const { resolved } = await makeLink();
    const bad = await claimViaLink(resolved, { mode: "single", values: { guest_name: "   " } }, "ip-v");
    expect(bad).toMatchObject({ ok: false, status: 422 });
    const good = await claimViaLink(resolved, { mode: "single", values: { guest_name: "  Ada\nLovelace ", extra: "x" } }, "ip-v");
    expect(good.ok && good.rows).toEqual([{ guest_name: "Ada Lovelace" }]);
    expect(good.ok && good.job).toMatchObject({ width: 1000, height: 1400, scale: 1, dpi: 300 });
  });

  it("reserves bulk rows all-or-nothing and enforces the per-batch limit", async () => {
    const { token, resolved } = await makeLink({ maxGenerations: 10, maxBulkRows: 8 });
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ guest_name: `Row ${i}` }));

    expect(await claimViaLink(resolved, { mode: "bulk", rows: rows(9), filenamePattern: "{n}" }, "ip-b")).toMatchObject({ ok: false, status: 400 });
    expect(await claimViaLink(resolved, { mode: "bulk", rows: rows(7), filenamePattern: "{n}" }, "ip-b")).toMatchObject({ ok: true });
    // 3 left: a batch of 4 is refused entirely.
    expect(await claimViaLink(resolved, { mode: "bulk", rows: rows(4), filenamePattern: "{n}" }, "ip-b")).toMatchObject({ ok: false, status: 409 });

    const link = await prisma.shareLink.findUniqueOrThrow({ where: { token } });
    expect(link.generationsUsed).toBe(7);
    expect(await prisma.bulkRun.count({ where: { shareLinkId: link.id } })).toBe(1);
  });

  it("rejects a bulk batch containing an invalid row, naming the row", async () => {
    const { resolved } = await makeLink();
    const result = await claimViaLink(
      resolved,
      { mode: "bulk", rows: [{ guest_name: "Ok" }, { guest_name: "" }], filenamePattern: "{n}" },
      "ip-r",
    );
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(!result.ok && result.rowErrors?.map((e) => e.row)).toEqual([1]);
  });

  it("rate-limits single claims per IP and link", async () => {
    const { resolved } = await makeLink();
    const results = [];
    for (let i = 0; i < 21; i++) {
      results.push(await claimViaLink(resolved, { mode: "single", values: { guest_name: `G${i}` } }, "busy-ip"));
    }
    expect(results.slice(0, 20).every((r) => r.ok)).toBe(true);
    expect(results[20]).toMatchObject({ ok: false, status: 429 });
  });
});

describe("resolveLink", () => {
  it("reports disabled, expired and exhausted links", async () => {
    const disabled = await makeLink();
    await prisma.shareLink.update({ where: { token: disabled.token }, data: { enabled: false } });
    expect(await resolveLink(disabled.token)).toEqual({ problem: "disabled" });

    const expired = await makeLink();
    await prisma.shareLink.update({ where: { token: expired.token }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveLink(expired.token)).toEqual({ problem: "expired" });

    const exhausted = await makeLink({ maxGenerations: 1 });
    await prisma.shareLink.update({ where: { token: exhausted.token }, data: { generationsUsed: 1 } });
    expect(await resolveLink(exhausted.token)).toEqual({ problem: "exhausted" });

    expect(await resolveLink("not-a-real-token-at-all")).toEqual({ problem: "not_found" });
  });
});
