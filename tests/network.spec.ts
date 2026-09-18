import { test, expect } from '@playwright/test';
test('real WebRTC: four players, ready gate, shared hunt, rejoin, host recovery and shared result', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext({ viewport: { width: 1000, height: 800 } })),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [host, guest, third, fourth, extra] = pages;
  const errors: string[] = [];
  pages.forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  await host.goto('./');
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
  await extra.getByRole('button', { name: '参加する', exact: true }).click();
  await expect(extra.getByRole('status')).toContainText('満員', { timeout: 30000 });
  await contexts[4].close();
  await host.getByRole('button', { name: '全員で出発', exact: true }).click();
  await expect(guest.getByRole('meter', { name: '体力', exact: true })).toBeVisible();
  const id = await guest.evaluate(() => window.__HUNT_STATE__().playerId);
  const before = await host.evaluate(
    (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!.z,
    id,
  );
  await guest.keyboard.down('w');
  await expect
    .poll(async () =>
      Math.abs(
        (await host.evaluate(
          (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!.z,
          id,
        )) - before,
      ),
    )
    .toBeGreaterThan(2);
  await guest.keyboard.up('w');
  await guest.reload();
  await guest.getByRole('button', { name: /前の集会所に復帰する/ }).click();
  await expect(guest.getByRole('meter', { name: '体力', exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(await guest.evaluate(() => window.__HUNT_STATE__().playerId)).toBe(id);
  const rejoinZ = await host.evaluate(
    (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!.z,
    id,
  );
  await guest.keyboard.down('s');
  await expect
    .poll(async () =>
      Math.abs(
        (await host.evaluate(
          (id) => window.__HUNT_STATE__().world!.players.find((p) => p.id === id)!.z,
          id,
        )) - rejoinZ,
      ),
    )
    .toBeGreaterThan(1);
  await guest.keyboard.up('s');
  await host.reload();
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
  await expect(guest.getByRole('button', { name: '準備完了', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await Promise.all(contexts.slice(0, 4).map((c) => c.close()));
});
