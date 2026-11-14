import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', workers: 1,
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173/api/status', reuseExistingServer: !process.env.CI, timeout: 30000 },
  outputDir: './test-results', reporter: 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } },
});
