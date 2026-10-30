import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';

const SHOTS = process.env.SHOTS_DIR ?? 'e2e/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Fake handwriting service: Malayalam candidates for ml, English for en. */
async function mockRecognizer(page: Page) {
  const calls: string[] = [];
  await page.route('https://inputtools.google.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const lang = body.requests[0].language;
    calls.push(lang);
    const cands = lang === 'en' ? ['hello', 'hallo'] : ['മഴ', 'മഴു', 'മാഴ'];
    await route.fulfill({ json: ['SUCCESS', [['id', cands, [], {}]]] });
  });
  return calls;
}

async function draw(page: Page, box: { x: number; y: number }, pts: [number, number][]) {
  await page.mouse.move(box.x + pts[0][0], box.y + pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
  await page.mouse.up();
}

const lastField = (page: Page) => page.locator('.page textarea').last();
const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
});

test('full writing flow', async ({ page }) => {
  const calls = await mockRecognizer(page);
  await page.goto('/');

  // --- onboarding
  await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeVisible();
  await shot(page, '01-welcome');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Open the sample' }).click();
  await expect(page.locator('.page textarea').first()).toHaveValue('INT. ചായക്കട - രാവിലെ');
  await page.waitForTimeout(300);
  await shot(page, '02-editor');

  // --- Manglish typing in a new action line
  await lastField(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('njaan vannu ');
  await expect(lastField(page)).toHaveValue('ഞാൻ വന്നു ');
  // Backspace right after a conversion keeps the English word
  await page.keyboard.type('please ');
  await page.keyboard.press('Backspace');
  await expect(lastField(page)).toHaveValue('ഞാൻ വന്നു please');

  // --- character cue: Tab to change element, Latin prefix auto-completes a Malayalam name
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator('.block-row').last()).toHaveClass(/t-character/);
  await page.keyboard.type('laksh');
  await expect(page.locator('.suggest li').first()).toHaveText('ലക്ഷ്മി');
  await shot(page, '03-autocomplete');
  await page.keyboard.press('Enter');
  await expect(lastField(page)).toHaveValue('ലക്ഷ്മി');
  await page.keyboard.press('Enter');
  await expect(page.locator('.block-row').last()).toHaveClass(/t-dialogue/);
  await page.keyboard.type('sheri, OK.');
  await expect(lastField(page)).toHaveValue('ശെരി, OK.');
  await expect(page.locator('.lang-tag').last()).toHaveText('MIX');

  // --- typing INT./EXT. on an action line starts a new scene; INT stays English
  await page.keyboard.press('Enter'); // → character
  await page.keyboard.press('Enter'); // empty character → action
  await expect(page.locator('.block-row').last()).toHaveClass(/t-action/);
  await page.keyboard.type('EXT. kaavu - raathri');
  await page.keyboard.press('Enter');
  await expect(page.locator('.scene')).toHaveCount(4);
  await expect(page.locator('.scene').last().locator('textarea').first()).toHaveValue('EXT. കാവു - രാത്രി');

  // --- handwriting: pad → consent → text inserted → one-tap alternative
  await page.getByRole('button', { name: '✍ Write by hand' }).click();
  await lastField(page).click();
  const canvas = page.locator('.pad-canvas');
  const box = (await canvas.boundingBox())!;
  await draw(page, box, [[60, 90], [80, 60], [100, 100], [120, 60], [140, 95]]);
  await draw(page, box, [[170, 60], [175, 110]]);
  await expect(page.getByRole('dialog', { name: 'Allow online recognition' })).toBeVisible({ timeout: 4000 });
  await shot(page, '04-consent');
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(lastField(page)).toHaveValue('മഴ');
  await expect(page.locator('.cand')).toHaveCount(6); // 3 ml + 2 en + remove
  await shot(page, '05-handwriting');
  await page.locator('.cand', { hasText: 'മഴു' }).click();
  await expect(lastField(page)).toHaveValue('മഴു');
  // write again → smart space, then pick the English reading of the same ink
  await draw(page, box, [[60, 90], [80, 60], [100, 100]]);
  await expect(lastField(page)).toHaveValue('മഴു മഴ');
  await page.locator('.cand', { hasText: 'hello' }).click();
  await expect(lastField(page)).toHaveValue('മഴു hello');
  await page.getByRole('button', { name: 'Remove last word' }).click();
  await expect(lastField(page)).toHaveValue('മഴു');
  expect(calls.filter((c) => c === 'ml').length).toBe(2);

  // scratch-out: write, then zig-zag over it before the pause → erased, nothing sent
  const before = calls.length;
  await draw(page, box, [[300, 80], [360, 80]]);
  await draw(page, box, [[290, 80], [370, 82], [292, 84], [368, 80], [294, 83], [366, 81], [296, 80]]);
  await page.waitForTimeout(1500);
  expect(calls.length).toBe(before);
  await expect(lastField(page)).toHaveValue('മഴു');
  await page.getByRole('button', { name: 'Hide handwriting pad' }).click();

  // --- consistency checker fixes രാമൂ → രാമു
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByRole('dialog').getByText('രാമൂ')).toBeVisible();
  await shot(page, '06-consistency');
  await page.getByRole('button', { name: /everywhere/ }).click();
  await expect(page.getByText('All character names are consistent')).toBeVisible();
  await page.keyboard.press('Escape');

  // --- find & replace
  await page.keyboard.press('Control+f');
  await page.getByLabel('Find', { exact: true }).fill('ചായ');
  await expect(page.locator('.findbar .count')).toHaveText(/of 3/);
  await page.getByLabel('Replace with').fill('കാപ്പി');
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.findbar .ok')).toHaveText('Replaced 3');
  await expect(page.locator('.page textarea').first()).toHaveValue('INT. കാപ്പിക്കട - രാവിലെ');
  await page.getByRole('button', { name: 'Close find' }).click();

  // --- undo brings it back
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.page textarea').first()).toHaveValue('INT. ചായക്കട - രാവിലെ');

  // --- scene notes panel
  await page.locator('.page textarea').first().click();
  if (!(await page.locator('.panel').isVisible())) await page.getByRole('button', { name: 'Scene notes' }).click();
  await page.locator('#synopsis').fill('Rain. Ramu waits for customers.');
  const notes = (await page.locator('.notes-canvas').boundingBox())!;
  await draw(page, notes, [[30, 40], [120, 80], [200, 40]]);
  await shot(page, '07-scene-notes');

  // --- cards board + drag reorder
  await page.getByRole('tab', { name: 'Cards' }).click();
  await expect(page.locator('.card h3').first()).toHaveText('INT. ചായക്കട - രാവിലെ');
  await shot(page, '08-cards');
  const grip3 = (await page.locator('.card .grip').nth(2).boundingBox())!;
  const card1 = (await page.locator('.card').nth(0).boundingBox())!;
  await page.mouse.move(grip3.x + 5, grip3.y + 5);
  await page.mouse.down();
  await page.mouse.move(card1.x + 40, card1.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.card h3').first()).toHaveText('INT. ലക്ഷ്മിയുടെ വീട് - രാത്രി');
  await expect(page.locator('.nav-item').first()).toContainText('ലക്ഷ്മിയുടെ');
  await page.getByRole('tab', { name: 'Script' }).click();

  // --- versions
  await page.getByRole('button', { name: 'Versions' }).click();
  await page.getByLabel('Version name').fill('Blue draft');
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.locator('.versions li')).toHaveCount(1);
  await expect(page.locator('.versions')).toContainText('Blue draft');
  await page.keyboard.press('Escape');

  // --- exports
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await shot(page, '09-export');
  const [doc] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Word document/ }).click()]);
  expect(doc.suggestedFilename()).toBe('മഴക്കാലം.doc');
  const docText = fs.readFileSync((await doc.path())!, 'utf8');
  expect(docText).toContain('ലക്ഷ്മി');
  expect(docText).toContain('class="character"');
  const [fountain] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Fountain/ }).click()]);
  const f = fs.readFileSync((await fountain.path())!, 'utf8');
  expect(f).toContain('Title: മഴക്കാലം');
  expect(f).toContain('EXT. കാവു - രാത്രി #');
  fs.writeFileSync(`${SHOTS}/sample.fountain`, f);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Breakdown sheet/ }).click()]);
  const c = fs.readFileSync((await csv.path())!, 'utf8');
  expect(c).toContain('Scene,INT/EXT,Location,Day/Night');
  expect(c).toContain('NIGHT');
  fs.writeFileSync(`${SHOTS}/breakdown.csv`, c);

  // PDF: capture the print document and render it as a real PDF
  await page.evaluate(() => {
    (window as unknown as { __printed: string[] }).__printed = [];
    const orig = document.body.appendChild.bind(document.body);
    document.body.appendChild = <T extends Node>(n: T): T => {
      const r = orig(n);
      if (n instanceof HTMLIFrameElement) {
        n.contentWindow!.print = () => (window as unknown as { __printed: string[] }).__printed.push(n.contentDocument!.documentElement.outerHTML);
      }
      return r;
    };
  });
  await page.getByRole('button', { name: /^PDF/ }).click();
  await page.waitForFunction(() => (window as unknown as { __printed: string[] }).__printed.length > 0);
  const html = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed[0]);
  expect(html).toContain('@font-face');
  const pdfPage = await page.context().newPage();
  await pdfPage.setContent(html, { waitUntil: 'load' });
  await pdfPage.evaluate(() => document.fonts.ready);
  await pdfPage.pdf({ path: `${SHOTS}/sample-screenplay.pdf`, format: 'Letter', preferCSSPageSize: true });
  await pdfPage.setViewportSize({ width: 816, height: 1056 });
  await pdfPage.screenshot({ path: `${SHOTS}/10-pdf-page.png`, fullPage: true });
  await pdfPage.close();

  // encrypted backup
  await page.getByLabel('Passphrase', { exact: true }).fill('mazha2026');
  await page.getByLabel('Repeat passphrase').fill('mazha2026');
  const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  const bkPath = `${SHOTS}/backup.cine`;
  await bk.saveAs(bkPath);
  expect(fs.readFileSync(bkPath).subarray(0, 5).toString()).toBe('CINE1');
  expect(fs.readFileSync(bkPath).toString('utf8')).not.toContain('ലക്ഷ്മി');
  await page.keyboard.press('Escape');

  // --- persistence across reload
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('.scene')).toHaveCount(4);
  await expect(page.locator('.scene').last().locator('textarea').last()).toHaveValue('മഴു');

  // --- restore the backup as a copy from the library
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.script-card')).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles(bkPath);
  await page.getByLabel('Passphrase').fill('wrong');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Wrong passphrase')).toBeVisible();
  await page.getByLabel('Passphrase').fill('mazha2026');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('.scene')).toHaveCount(4);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.script-card')).toHaveCount(2);
  await shot(page, '11-library');

  expect(errors).toEqual([]);
});

test('tamil script + phone layout', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start writing', exact: false }).or(page.getByRole('button', { name: 'Close' })).first().click();
  await page.getByRole('button', { name: '+ New script' }).click();
  await page.getByLabel('Title').fill('நன்றி');
  await page.getByRole('button', { name: 'தமிழ்' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.page textarea').first()).toHaveValue('INT. வீடு - பகல்');
  await page.getByRole('button', { name: 'Hide handwriting pad' }).click();
  await page.locator('.page textarea').nth(1).click();
  await page.keyboard.type('amma sollu, nandri ');
  await expect(page.locator('.page textarea').nth(1)).toHaveValue('அம்ம சொல்லு, நன்றி ');
  await shot(page, '12-phone-tamil');
  await ctx.close();
  expect(errors).toEqual([]);
});
