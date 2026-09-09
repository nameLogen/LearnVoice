import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  workers: 2,
  webServer: [
    { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
    { command: 'node tests/serve-subdirectory.mjs', url: 'http://127.0.0.1:4175/temp/LearnVoice/', reuseExistingServer: !process.env.CI },
  ],
  projects: [
    {name:'mobile-chromium',use:{...devices['Pixel 7']}},
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}}
  ]
});
