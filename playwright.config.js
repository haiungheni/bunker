const { defineConfig } = require('@playwright/test');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
if (!process.env.BUNKER_E2E_DATA_DIR)
  process.env.BUNKER_E2E_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-e2e-'));
module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:43187',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:43187/api/info',
    reuseExistingServer: false,
    env: {
      PORT: '43187',
      BUNKER_DATA_DIR: process.env.BUNKER_E2E_DATA_DIR,
      BUNKER_MODERATOR_PIN: '654321',
    },
  },
  globalTeardown: require.resolve('./tests/browser/cleanup.js'),
});
