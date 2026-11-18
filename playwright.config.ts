import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
// E2E_CHROME=1 runs the Chromium projects in the installed Google Chrome (no browser download).
const chrome = process.env.E2E_CHROME ? { channel: "chrome" } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], ...chrome, viewport: { width: 1440, height: 900 } } },
    { name: "iphone-14", use: { ...devices["iPhone 14"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"], ...chrome } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
