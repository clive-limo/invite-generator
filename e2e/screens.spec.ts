// Screenshot tour for visual review: `SHOTS_DIR=/some/dir npx playwright test e2e/screens.spec.ts --project=desktop-chrome`.
// Skipped unless SHOTS_DIR is set.
import path from "node:path";
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { FIXTURES, makeTemplatePng, verifyEmail } from "./helpers";

const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to capture screenshots");

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

function tourCsv() {
  const file = path.join(FIXTURES, "tour.csv");
  const names = ["Amina Yusuf", "Brian Otieno", "Chloe Mensah", "David Kariuki", "", "Fatuma Ali", "Grace Njeri"];
  writeFileSync(file, ["Guest name,Message", ...names.map((n) => `${n},Dinner at 7pm`)].join("\n"));
  return file;
}

test("screenshot tour", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(dir!, `${name}.png`) });
  const ctx = await browser.newContext({ baseURL, viewport: desktop });
  const page = await ctx.newPage();
  await page.goto("/");
  await shot(page, "01-landing-desktop");
  await page.setViewportSize(phone);
  await shot(page, "02-landing-phone");
  await page.goto("/sign-up");
  await shot(page, "03-signup-phone");

  const email = `shots+${Date.now()}@example.com`;
  await page.request.post("/api/auth/sign-up/email", { data: { name: "Amara Okafor", email, password: "supersecret1" }, headers: { origin: baseURL! } });
  await verifyEmail(email);
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "supersecret1" }, headers: { origin: baseURL! } });

  await page.setViewportSize(desktop);
  await page.goto("/dashboard");
  await expect(page.getByText("Upload your first design")).toBeVisible();
  await shot(page, "04-dashboard-empty");
  await page.goto("/templates/new");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles(makeTemplatePng());
  await expect(page.getByRole("button", { name: "Continue to fields" })).toBeVisible();
  await shot(page, "05-upload-ready");
  await page.getByRole("button", { name: "Continue to fields" }).click();
  await page.waitForURL(/edit$/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Text field" }).click();
  await page.getByRole("button", { name: "Text field" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Message");
  await page.getByRole("switch").nth(1).click(); // multi-line
  await page.getByLabel("Sample value").fill("We would be honoured by your presence at our celebration");
  await page.getByLabel("Y", { exact: true }).fill("1100");
  await page.getByLabel("Height", { exact: true }).fill("260");
  await page.waitForTimeout(800);
  await shot(page, "06-editor-desktop");
  await page.getByRole("button", { name: /^Publish/ }).click();
  await expect(page.getByText("Published version 1")).toBeVisible();
  const templateUrl = page.url().replace(/\/edit$/, "");

  await page.setViewportSize(phone);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Field: Guest name" }).click({ position: { x: 20, y: 10 } });
  await page.waitForTimeout(400);
  await shot(page, "07-editor-phone");
  await page.getByRole("button", { name: "Style" }).click();
  await page.waitForTimeout(600);
  await shot(page, "08-editor-phone-style");

  await page.setViewportSize(desktop);
  await page.goto(`${templateUrl}/links`);
  await page.getByRole("button", { name: "Create your first link" }).click();
  await shot(page, "09-link-dialog");
  await page.getByRole("button", { name: "Create link" }).click();
  const share = new URL(await page.getByLabel("Share URL").inputValue()).pathname;
  await page.waitForTimeout(500);
  await shot(page, "10-links");
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Template actions" })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "11-dashboard");

  const guest = await browser.newContext({ baseURL, viewport: phone, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const g = await guest.newPage();
  await g.goto(share);
  await g.waitForLoadState("networkidle");
  await g.waitForTimeout(500);
  await shot(g, "12-guest-phone-empty");
  await g.getByLabel("Guest name").fill("Dr. Wanjiru Kamau");
  await g.getByLabel("Message").fill("Join us for an evening of music, dinner and dancing");
  await g.waitForTimeout(300);
  await shot(g, "13-guest-phone-filled");
  const [png] = await Promise.all([
    g.waitForEvent("download", { timeout: 60_000 }),
    g.getByRole("button", { name: "Download PNG" }).filter({ visible: true }).click(),
  ]);
  await png.saveAs(path.join(dir!, "invite-output.png"));
  await g.waitForTimeout(300);
  await shot(g, "14-guest-phone-downloaded");
  await g.goto(`${share}/bulk`);
  await g.waitForLoadState("networkidle");
  await g.locator('input[type="file"]').setInputFiles(tourCsv());
  await g.getByRole("button", { name: "Review rows" }).click();
  await g.waitForTimeout(500);
  await shot(g, "15-bulk-phone-review");

  const gd = await browser.newContext({ baseURL, viewport: desktop });
  const d = await gd.newPage();
  await d.goto(share);
  await d.waitForLoadState("networkidle");
  await d.getByLabel("Guest name").fill("Dr. Wanjiru Kamau");
  await d.waitForTimeout(500);
  await shot(d, "16-guest-desktop");
  await d.goto(`${share}/bulk`);
  await d.waitForLoadState("networkidle");
  await d.locator('input[type="file"]').setInputFiles(tourCsv());
  await shot(d, "17-bulk-desktop-map");
  await d.getByRole("button", { name: "Review rows" }).click();
  await d.waitForTimeout(500);
  await shot(d, "18-bulk-desktop-review");
});
