import { test, expect } from '@playwright/test';
test.use({ actionTimeout: process.env.CI ? 45000 : 15000 });
const inputEvents: string[] = [];
test.afterEach(async ({ browser }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const snapshots = await Promise.all(
    browser.contexts().flatMap((context) =>
      context.pages().map(async (page) => {
        try {
          return await page.evaluate(() => ({
            state: window.__HUNT_STATE__?.(),
            visibility: document.visibilityState,
            active: document.activeElement?.outerHTML,
          }));
        } catch {
          return { closed: true };
        }
      }),
    ),
  );
  await testInfo.attach('network-state', {
    body: JSON.stringify(snapshots, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('network-input-events', {
    body: inputEvents.join('\n'),
    contentType: 'text/plain',
  });
});
test('real WebRTC: four players, ready gate, shared hunt, rejoin, host recovery and shared result', async ({
  browser,
}) => {
  test.setTimeout(process.env.CI ? 300_000 : 180_000);
  inputEvents.length = 0;
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({
        viewport: process.env.CI ? { width: 640, height: 480 } : { width: 1000, height: 800 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [host, guest, third, fourth, extra] = pages;
  guest.on('console', (message) => {
    if (message.text().startsWith('INPUT_EVENT')) inputEvents.push(message.text());
  });
  await guest.addInitScript(() => {
    for (const type of ['keydown', 'keyup', 'blur', 'focus', 'visibilitychange'])
      window.addEventListener(type, (event) => {
        const state = window.__HUNT_STATE__?.();
        console.debug(
          'INPUT_EVENT',
          JSON.stringify({
            type,
            code: (event as KeyboardEvent).code,
            target: (event.target as HTMLElement)?.tagName,
            visibility: document.visibilityState,
            controls: state?.controls,
            room: state?.room,
          }),
        );
      });
  });
  const errors: string[] = [];
  pages.forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  await host.goto('./');
  await host.bringToFront();
  await host.getByLabel('クエスト難度').selectOption('practice');
  await host.getByRole('button', { name: '仲間と狩る', exact: true }).click();
  await host.getByLabel('ハンター名', { exact: true }).fill('HOST');
  await host.getByRole('button', { name: '集会所を作成', exact: true }).click();
  await expect(host.getByRole('status')).toContainText('招待コードを仲間に共有してください', {
    timeout: 35000,
  });
  const code = await host.getByTestId('room-code').innerText();
  for (const [i, p] of [guest, third, fourth].entries()) {
    await p.goto(`./#room=${code}`);
    await p.bringToFront();
    await p.getByLabel('ハンター名', { exact: true }).fill(`GUEST${i + 1}`);
    await p.getByRole('button', { name: '参加する', exact: true }).click();
    await expect(p.getByRole('button', { name: '準備完了', exact: true })).toBeEnabled({
      timeout: 35000,
    });
    await expect(host.getByRole('button', { name: '全員で出発', exact: true })).toBeDisabled();
    await p.getByRole('button', { name: '準備完了', exact: true }).click();
  }
  await expect(host.locator('.member.occupied')).toHaveCount(4);
  await extra.goto(`./#room=${code}`);
  await extra.bringToFront();
  await extra.getByRole('button', { name: '参加する', exact: true }).click();
  await expect(extra.getByRole('status')).toContainText('満員', { timeout: 30000 });
  await contexts[4].close();
  await host.bringToFront();
  await host.getByRole('button', { name: '全員で出発', exact: true }).click();
  await guest.bringToFront();
  await expect(guest.getByRole('meter', { name: '体力', exact: true })).toBeVisible();
  const id = await guest.evaluate(() => window.__HUNT_STATE__().playerId);
  const before = await host.evaluate(
    (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!,
    id,
  );
  await guest.keyboard.down('w');
  await expect
    .poll(async () => {
      const p = await host.evaluate(
        (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!,
        id,
      );
      return Math.hypot(p.x - before.x, p.z - before.z);
    })
    .toBeGreaterThan(2);
  await guest.keyboard.up('w');
  await guest.reload();
  await guest.bringToFront();
  await guest.getByRole('button', { name: /前の集会所に復帰する/ }).click();
  await expect(guest.getByRole('meter', { name: '体力', exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(await guest.evaluate(() => window.__HUNT_STATE__().playerId)).toBe(id);
  const rejoined = await host.evaluate(
    (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!,
    id,
  );
  await guest.keyboard.down('s');
  await expect
    .poll(async () => {
      const p = await host.evaluate(
        (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!,
        id,
      );
      return Math.hypot(p.x - rejoined.x, p.z - rejoined.z);
    })
    .toBeGreaterThan(1);
  await guest.keyboard.up('s');
  await guest.getByRole('button', { name: '狩猟メニュー', exact: true }).click();
  const menuTime = await guest.evaluate(() => window.__HUNT_STATE__().world!.elapsed);
  await expect
    .poll(
      async () => (await guest.evaluate(() => window.__HUNT_STATE__().world!.elapsed)) - menuTime,
    )
    .toBeGreaterThan(1);
  await expect(guest.getByRole('dialog', { name: '狩猟メニュー' })).toBeVisible();
  await guest.getByRole('button', { name: '狩りに戻る', exact: true }).click();
  await host.bringToFront();
  await host.reload();
  await host.bringToFront();
  await host.getByRole('button', { name: '仲間と狩る', exact: true }).click();
  await host.getByRole('button', { name: /前の集会所に復帰する/ }).click();
  await expect(host.getByRole('meter', { name: '体力', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(
      async () =>
        await guest.evaluate(
          () => window.__HUNT_STATE__().world!.players.filter((p) => p.connected).length,
        ),
      { timeout: 30000 },
    )
    .toBe(4);
  await host.getByRole('button', { name: '狩猟メニュー', exact: true }).click();
  await host.getByRole('button', { name: 'クエストをリタイア', exact: true }).click();
  for (const p of [host, guest, third, fourth])
    await expect(p.getByRole('heading', { name: 'また、次の狩りへ。' })).toBeVisible();
  await host.getByRole('button', { name: 'キャンプへ帰還', exact: true }).click();
  await guest.bringToFront();
  await expect(guest.getByRole('button', { name: '準備完了', exact: true })).toBeVisible();
  await guest.getByRole('button', { name: '集会所から退出', exact: true }).click();
  await expect(host.locator('.member.occupied')).toHaveCount(3);
  await guest.getByRole('button', { name: '仲間と狩る', exact: true }).click();
  await guest.getByRole('button', { name: '参加する', exact: true }).click();
  await expect(guest.getByRole('button', { name: '準備完了', exact: true })).toBeEnabled();
  await expect(host.locator('.member.occupied')).toHaveCount(4);
  expect(await guest.evaluate(() => window.__HUNT_STATE__().playerId)).not.toBe(id);
  expect(errors).toEqual([]);
  await Promise.all(contexts.slice(0, 4).map((c) => c.close()));
});
