import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173');
await fs.mkdir('artifacts/gallery', { recursive: true });
for (const name of [
  'リオレウス',
  'リオレイア',
  'ジンオウガ',
  'ティガレックス',
  'ナルガクルガ',
  'ラージャン',
]) {
  await page.locator('.quest-card').filter({ hasText: name }).click();
  await page.getByRole('button', { name: 'ソロで出発', exact: true }).click();
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => window.__HUNT_STATE__());
  await page.screenshot({ path: `artifacts/gallery/${info.world.monster.id}.png` });
  console.log(
    JSON.stringify({ monster: info.world.monster.id, fps: info.fps, errors: [...errors] }),
  );
  await page.getByRole('button', { name: '狩猟メニュー', exact: true }).click();
  await page.getByRole('button', { name: 'クエストをリタイア', exact: true }).click();
  await page.getByRole('button', { name: 'キャンプへ帰還', exact: true }).click();
}
await browser.close();
if (errors.length) process.exitCode = 1;
