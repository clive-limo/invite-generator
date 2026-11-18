import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { makeGuestCsv, makeTemplatePng, readPdfInfo, readPngInfo, readZipEntries, verifyEmail } from "./helpers";

const TEMPLATE = { width: 1240, height: 1748 };
/** The PDF page is the template's print size at 300 DPI, in points. */
const PAGE = { pageWidth: (TEMPLATE.width * 72) / 300, pageHeight: (TEMPLATE.height * 72) / 300 };

function expectInvitePdf(bytes: Buffer) {
  const info = readPdfInfo(bytes);
  expect({ pageWidth: info.pageWidth, pageHeight: info.pageHeight, width: info.width, height: info.height }).toEqual({ ...PAGE, ...TEMPLATE });
  return info;
}

/** Decodes a JPEG in the browser and returns it as PNG bytes, for comparing against a golden. */
async function jpegToPng(page: Page, jpeg: Buffer): Promise<Buffer> {
  const png = await page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, jpeg.toString("base64"));
  return Buffer.from(png, "base64");
}

/** Uploads the guest CSV, skips the bad row and downloads the ZIP with the given button. */
async function downloadBatch(page: Page, shareUrl: string, button: string) {
  await page.goto(`${shareUrl}/bulk`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles(makeGuestCsv());
  await expect(page.getByRole("heading", { name: "Match your columns" })).toBeVisible();
  await page.getByRole("button", { name: "Review rows" }).click();
  await expect(page.getByText("9 ready")).toBeVisible();
  await expect(page.getByText("1 need attention")).toBeVisible();
  await page.getByRole("button", { name: "Skip all 1" }).click();
  let zipDownload;
  if (test.info().project.name === "iphone-14") {
    // iOS only saves downloads started by a tap, so the finished ZIP waits for "Save".
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("heading", { name: "9 invites ready" })).toBeVisible({ timeout: 90_000 });
    [zipDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save" }).click()]);
  } else {
    [zipDownload] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), page.getByRole("button", { name: button }).click()]);
  }
  // The list is cleared and the upload step is back, with the skipped row still downloadable.
  await expect(page.getByText("Choose your guest list")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("9 invites downloaded").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "1 skipped row (CSV)" })).toBeVisible();
  return readZipEntries((await zipDownload.path())!);
}

/** Owner side always runs at desktop size: sign up, upload, add fields, publish, create a link. */
async function setUpTemplate(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  logErrors(page, "owner");
  const email = `owner+${Date.now()}@example.com`;
  const password = "supersecret1";

  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "E2E Owner", email, password, callbackURL: "/dashboard" },
    headers: { origin: baseURL },
  });
  expect(signUp.ok()).toBeTruthy();
  await verifyEmail(email);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your templates" })).toBeVisible();

  await page.goto("/templates/new");
  await page.waitForLoadState("networkidle"); // hydrated, so the file input's onChange is attached
  await page.locator('input[type="file"]').setInputFiles(makeTemplatePng(TEMPLATE.width, TEMPLATE.height));
  await expect(page.getByText(`${TEMPLATE.width} × ${TEMPLATE.height}px`)).toBeVisible();
  await page.getByLabel("Template name").fill("E2E Gala");
  await page.getByRole("button", { name: "Continue to fields" }).click();
  await page.waitForURL(/\/templates\/[^/]+\/edit$/);
  const templateUrl = page.url().replace(/\/edit$/, "");

  // Two fields: the default "Guest name" and one renamed to "Table".
  await page.getByRole("button", { name: "Text field" }).click();
  await expect(page.getByRole("heading", { name: "Guest name" })).toBeVisible();
  await page.getByRole("button", { name: "Text field" }).click();
  const label = page.getByLabel("Label", { exact: true });
  await label.fill("Table");
  await expect(page.getByLabel("Column name")).toHaveValue("table");
  // Move it below the name via the position panel.
  const y = page.getByLabel("Y", { exact: true });
  await y.fill("1100");
  await y.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Publish/ }).click();
  await expect(page.getByText("Published version 1")).toBeVisible();

  await page.goto(`${templateUrl}/links`);
  await page.getByRole("button", { name: "Create your first link" }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const shareUrl = await page.getByLabel("Share URL").inputValue();
  expect(shareUrl).toMatch(/\/i\/[A-Za-z0-9_-]{22}$/);

  return { context, page, templateUrl, shareUrl: new URL(shareUrl).pathname };
}

function logErrors(page: Page, who: string) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${who} console] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[${who} pageerror] ${e.message}`));
}

test("owner publishes a template; a guest makes one invite and a batch from CSV", async ({ browser, page, baseURL }) => {
  logErrors(page, "guest");
  const owner = await setUpTemplate(browser, baseURL!);

  // ── Single invite as a guest (this project's device) ──────────────────────
  await page.goto(owner.shareUrl);
  await expect(page.getByRole("heading", { name: "E2E Gala" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // hydrated, or a fast fill is wiped by the controlled inputs
  await page.getByLabel("Guest name").fill("Ada Lovelace");
  await page.getByLabel("Table").fill("7");
  // One tap: the PNG downloads straight away and the form clears for the next guest.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Download PNG" }).filter({ visible: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Ada-Lovelace-invite.png");
  const png = readFileSync((await download.path())!);
  expect(readPngInfo(png)).toEqual({ ...TEMPLATE, dpi: 300 });
  // Golden per browser engine: catches layout/rendering regressions in the export itself.
  expect(png).toMatchSnapshot("single-invite.png", { maxDiffPixelRatio: 0.002 });
  await expect(page.getByLabel("Guest name")).toHaveValue("");
  await expect(page.getByLabel("Table")).toHaveValue("");

  // The secondary button: the same invite as a PDF at the print size.
  await page.getByLabel("Guest name").fill("Ada Lovelace");
  await page.getByLabel("Table").fill("7");
  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Download PDF" }).filter({ visible: true }).click(),
  ]);
  expect(pdfDownload.suggestedFilename()).toBe("Ada-Lovelace-invite.pdf");
  const pdf = expectInvitePdf(readFileSync((await pdfDownload.path())!));
  // The JPEG inside must match the PNG golden closely.
  expect(await jpegToPng(page, pdf.jpeg)).toMatchSnapshot("single-invite.png", { maxDiffPixelRatio: 0.002 });
  await expect(page.getByLabel("Guest name")).toHaveValue("");

  // ── Bulk from CSV: PNGs, then PDFs ────────────────────────────────────────
  const names = (ext: string) => Array.from({ length: 9 }, (_, i) => `Guest-Number-${i + 1}-invite.${ext}`).sort();
  const entries = await downloadBatch(page, owner.shareUrl, "Download ZIP · 9 invites");
  expect(entries.map((e) => e.name).sort()).toEqual(names("png"));
  for (const entry of entries) expect(readPngInfo(entry.data)).toEqual({ ...TEMPLATE, dpi: 300 });
  const pdfEntries = await downloadBatch(page, owner.shareUrl, "Download ZIP of PDFs");
  expect(pdfEntries.map((e) => e.name).sort()).toEqual(names("pdf"));
  for (const entry of pdfEntries) expectInvitePdf(entry.data);

  // ── Owner sees the activity; a paused link stops working ──────────────────
  await owner.page.goto(`${owner.templateUrl}/activity`);
  // 1 single + 9 + 9: the PDF of the same single invite is a repeat, so it isn't counted again.
  await expect(owner.page.getByText("19 invites created.")).toBeVisible();
  await owner.page.goto(`${owner.templateUrl}/links`);
  await owner.page.getByRole("switch", { name: "Turn link off" }).click();
  await expect(owner.page.getByText("Off", { exact: true })).toBeVisible();
  await page.goto(owner.shareUrl);
  await expect(page.getByRole("heading", { name: "This link is paused" })).toBeVisible();

  await owner.context.close();
});

test("signing up goes straight to the dashboard (no email confirmation)", async ({ page }) => {
  await page.goto("/sign-up");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("New Person");
  await page.getByLabel("Email").fill(`new+${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your templates" })).toBeVisible();
});

test("people outside the beta can't sign up or sign in", async ({ page }) => {
  const email = `stranger+${Date.now()}@not-invited.test`;
  const beta = page.getByText("Chenah Invites is still in beta, so accounts are invite-only for now.");
  await page.goto("/sign-up");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Stranger");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(beta).toBeVisible();

  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(beta).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});
