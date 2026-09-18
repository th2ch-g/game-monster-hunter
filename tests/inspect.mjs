import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
  args: process.env.CI
    ? ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173');
await page.getByRole('button', { name: 'ソロで出発', exact: true }).waitFor();
await page.waitForTimeout(1200);
await fs.mkdir('artifacts', { recursive: true });
await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
await page.getByRole('button', { name: 'ソロで出発', exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'artifacts/hunt-desktop.png' });
await page.keyboard.down('KeyW');
await page.waitForTimeout(1100);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyJ');
await page.waitForTimeout(2000);
await page.keyboard.up('KeyJ');
await page.screenshot({ path: 'artifacts/combat-desktop.png' });
console.log(JSON.stringify({ errors, state: await page.evaluate(() => window.__HUNT_STATE__()) }));
await browser.close();
