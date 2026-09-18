import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Input, World } from '../src/game/types';
declare global {
  interface Window {
    __HUNT_STATE__: () => {
      world: World | null;
      playerId: string;
      fps: number;
      room: unknown;
      controls: { enabled: boolean; keys: string[]; inputs: Record<string, Input> };
    };
  }
}
const state = (page: Page) => page.evaluate(() => window.__HUNT_STATE__());
test('quest board, all weapons, forge, save, help, and keyboard accessibility', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /ひと狩り/ })).toBeVisible();
  await expect(page.locator('.quest-card')).toHaveCount(6);
  await expect(page.locator('.monster-portrait').first()).toBeVisible();
  await page.getByRole('button', { name: '変更', exact: true }).click();
  await expect(page.locator('.weapon-card')).toHaveCount(14);
  await page.getByRole('button', { name: /ヘビィボウガン HEAVY BOWGUN/ }).click();
  await page.getByRole('button', { name: 'ヘビィボウガンを装備する' }).click();
  await expect(page.locator('.loadout strong')).toHaveText('ヘビィボウガン');
  await page.getByRole('button', { name: '加工屋', exact: true }).click();
  await page.getByRole('button', { name: '350 z で強化', exact: true }).first().click();
  await expect(page.locator('.forge-item').first()).toContainText('Lv.2');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.reload();
  await expect(page.locator('.loadout')).toContainText('Lv.2');
  await page.getByRole('button', { name: '遊び方', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'スマートフォン', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(errors).toEqual([]);
});
test('real 3D combat: movement, damage, dodge, pause, retreat, and another monster', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByLabel('クエスト難度').selectOption('practice');
  await page.getByRole('button', { name: 'ソロで出発', exact: true }).click();
  await expect(page.getByRole('meter', { name: '体力', exact: true })).toBeVisible();
  const before = (await state(page)).world!.players[0];
  await page.keyboard.down('w');
  await expect
    .poll(async () =>
      Math.hypot(
        (await state(page)).world!.players[0].x - before.x,
        (await state(page)).world!.players[0].z - before.z,
      ),
    )
    .toBeGreaterThan(5);
  await expect
    .poll(async () => {
      const w = (await state(page)).world!;
      return Math.hypot(w.players[0].x - w.monster.x, w.players[0].z - w.monster.z);
    })
    .toBeLessThan(4.4);
  await page.keyboard.up('w');
  await page.keyboard.down('j');
  await expect
    .poll(async () => (await state(page)).world!.players[0].damage, { timeout: 20000 })
    .toBeGreaterThan(0);
  await page.keyboard.up('j');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).world!.players[0].stamina).toBeLessThan(100);
  await page.getByRole('button', { name: '狩猟メニュー', exact: true }).click();
  const t = (await state(page)).world!.elapsed;
  await page.waitForTimeout(350);
  expect((await state(page)).world!.elapsed).toBeCloseTo(t, 1);
  await page.getByRole('button', { name: 'クエストをリタイア', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'また、次の狩りへ。' })).toBeVisible();
  await page.getByRole('button', { name: 'キャンプへ帰還' }).click();
  await page.locator('.quest-card').filter({ hasText: 'ラージャン' }).click();
  await page.getByRole('button', { name: 'ソロで出発', exact: true }).click();
  await expect(page.locator('.monster-hud h2')).toContainText('ラージャン');
  expect(errors).toEqual([]);
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 360, height: 780 },
])
  test(`mobile ${viewport.width}x${viewport.height}: layout, multi-touch movement, attack and items`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'ソロで出発', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByLabel('クエスト難度').selectOption('practice');
    await page.getByRole('button', { name: 'ソロで出発', exact: true }).tap();
    await expect(page.getByRole('group', { name: '移動スティック' })).toBeVisible();
    await expect(page.getByRole('button', { name: '攻撃', exact: true })).toBeVisible();
    const initial = (await state(page)).world!.players[0];
    const stick = page.getByRole('group', { name: '移動スティック' });
    const bounds = (await stick.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 40);
    await expect
      .poll(async () =>
        Math.hypot(
          (await state(page)).world!.players[0].x - initial.x,
          (await state(page)).world!.players[0].z - initial.z,
        ),
      )
      .toBeGreaterThan(1);
    await page.mouse.up();
    await page.getByRole('button', { name: '回避', exact: true }).tap();
    await expect.poll(async () => (await state(page)).world!.players[0].stamina).toBeLessThan(100);
    await page.getByRole('button', { name: '狩猟メニュー', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'シビレ罠 ×2' })).toBeVisible();
    await page.getByRole('button', { name: 'シビレ罠 ×2' }).tap();
    await expect.poll(async () => (await state(page)).world!.players[0].items.trap).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/mobile-${viewport.width}x${viewport.height}.png` });
    expect(errors).toEqual([]);
    await context.close();
  });
test('invalid stored progress recovers to a playable profile', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('guild:profile', '{"version":1,"weapon":"unknown"}'),
  );
  await page.goto('./');
  await expect(page.locator('.loadout strong')).toHaveText('太刀');
  await expect(page.getByRole('button', { name: 'ソロで出発', exact: true })).toBeEnabled();
});
test('complete a real hunt through normal controls and persist earned rewards', async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 240_000 : 150_000);
  await page.goto('./');
  await page.locator('.quest-card').filter({ hasText: 'リオレイア' }).click();
  await page.getByRole('button', { name: '変更', exact: true }).click();
  await page.getByRole('button', { name: /ヘビィボウガン HEAVY BOWGUN/ }).click();
  await page.getByRole('button', { name: 'ヘビィボウガンを装備する' }).click();
  await page.getByRole('button', { name: 'ソロで出発', exact: true }).click();
  await expect(page.getByRole('meter', { name: '体力', exact: true })).toBeVisible();
  await page.keyboard.down('j');
  const deadline = Date.now() + (process.env.CI ? 210000 : 120000);
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.world!.phase !== 'playing') break;
    const p = s.world!.players[0];
    if (p.hp < 75 && p.items.potion > 0) await page.keyboard.press('q');
    await page.waitForTimeout(400);
  }
  await page.keyboard.up('j');
  await expect(page.getByRole('heading', { name: '狩猟、達成。', exact: true })).toBeVisible();
  await expect(page.locator('.rewards')).toContainText('雌火竜の鱗');
  expect((await state(page)).world!.players[0].damage).toBeGreaterThan(100);
  await page.screenshot({ path: 'artifacts/quest-complete.png' });
  await page.getByRole('button', { name: 'キャンプへ帰還' }).click();
  await page.reload();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('guild:profile')!));
  expect(save.victories).toBe(1);
  expect(save.zenny).toBe(1300);
  expect(save.materials.rathian).toBeGreaterThanOrEqual(3);
});
test('genuine simultaneous touch input moves and attacks', async ({ browser, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'Chrome DevTools is required to inject simultaneous touch contacts.',
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('./');
  await page.getByLabel('クエスト難度').selectOption('practice');
  await page.getByRole('button', { name: 'ソロで出発', exact: true }).tap();
  const session = await context.newCDPSession(page);
  const a = (await page.getByRole('group', { name: '移動スティック' }).boundingBox())!,
    b = (await page.getByRole('button', { name: '攻撃', exact: true }).boundingBox())!;
  const x = a.x + a.width / 2,
    y = a.y + a.height / 2;
  const p0 = (await state(page)).world!.players[0];
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x, y: y - 40, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x, y: y - 40, id: 1 },
      { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 },
    ],
  });
  await expect.poll(async () => (await state(page)).world!.players[0].stamina).toBeLessThan(100);
  await expect
    .poll(async () => {
      const p = (await state(page)).world!.players[0];
      return Math.hypot(p.x - p0.x, p.z - p0.z);
    })
    .toBeGreaterThan(0.1);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await context.close();
});
