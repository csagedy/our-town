import { it } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';
it('repro', async () => {
  const page = await openPage({ viewport: 'ipad-air' });
  try {
    await page.eval(() => { window.__town.go ? 0 : 0; });
    await page.goto('index.html');
    await page.eval(() => window.__town.goTo && window.__town.goTo('booth'));
    await page.waitFor(() => window.__town.at === 'booth' && window.__town.scene && window.__town.scene.maker, { timeout: 20000 }).catch(() => {});
    console.log(await page.eval(() => [window.__town.at, Object.keys(window.__town)]));
  } finally { await page.close(); }
});
