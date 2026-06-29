// @ts-check
const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,      // auth state must be sequential
  workers: 1,                // one worker — prevents Supabase contention between test files
  retries: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    headless: true,
    viewport: { width: 390, height: 844 },   // mobile-first
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
