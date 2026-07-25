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
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    // devices['Desktop Chrome'] carries its own viewport (1280x720), which silently overrode a
    // top-level `viewport` key here for this project's entire history — every "mobile check" this
    // suite has ever run was actually executed at desktop width. Overriding viewport again AFTER
    // the spread is what actually takes effect (mobile-first, matches the app's own breakpoint).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
})
