import { defineConfig, devices } from '@playwright/test';

// Zwei Server: die echte App (Login, Weiterleitungen) und die Demo mit erfundenen Daten,
// in der sich Abläufe ohne Konto und ohne echte Datenbank durchklicken lassen.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /demo\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://localhost:5173' },
    },
    {
      name: 'demo',
      testMatch: /demo\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://localhost:5175' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'VITE_DEMO=true npx vite --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
