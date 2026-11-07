import { defineConfig } from '@playwright/test';
const port = process.env.SWISH_TEST_PORT ?? '1420';
export default defineConfig({ testDir: './tests/ui', use: { baseURL: `http://127.0.0.1:${port}` }, webServer: { command: `npm run dev:web -- --port ${port} --force`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI }, projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }] });
