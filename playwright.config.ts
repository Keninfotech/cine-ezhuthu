import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const localChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // iPad Pro 11" landscape
    viewport: { width: 1194, height: 834 },
    // UTF-8 locale so Malayalam/Tamil download filenames survive on bare Linux CI boxes
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }, ...(fs.existsSync(localChromium) ? { executablePath: localChromium } : {}) },
    permissions: ['clipboard-read'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1194, height: 834 } } }],
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
