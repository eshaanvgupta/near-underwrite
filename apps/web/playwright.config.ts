import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5173",
    port: 5173,
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "msedge" } },
    { name: "mobile", use: { ...devices["iPhone 13"], viewport: { width: 360, height: 800 }, browserName: "chromium", channel: process.env.PW_CHANNEL ?? "msedge" } },
  ],
});
