import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
  args: ['--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173');
await page.getByRole('button', { name: 'ソロで出発', exact: true }).waitFor();
await page.waitForTimeout(400);
const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/accessibility.json', JSON.stringify(r.violations, null, 2));
console.log(
  JSON.stringify(
    r.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
    })),
    null,
    2,
  ),
);
await browser.close();
