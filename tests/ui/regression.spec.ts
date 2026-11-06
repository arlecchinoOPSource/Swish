import { test, expect, type Page } from '@playwright/test';

/** Presses Tab until the focused element's accessible name matches; fails if unreachable. */
/** WebKit, like Safari, moves Tab between fields only; Option+Tab reaches every control. */
const tabKey = (page: Page) => page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';

async function tabTo(page: Page, name: string | RegExp, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(tabKey(page));
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute('aria-label') ?? el.innerText ?? '').trim() : '';
    });
    if (typeof name === 'string' ? label === name : name.test(label)) return;
  }
  throw new Error(`"${name}" is not reachable with Tab`);
}

test('the whole reminder workflow works with the keyboard alone', async ({ page }) => {
  await page.goto('/');
  await tabTo(page, 'New Project');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keyboard project');
  await page.keyboard.press(tabKey(page)); await page.keyboard.type('Made without a mouse');
  await page.keyboard.press(tabKey(page));
  // Typed digits fill Chromium's date segments; WebKit's date control does not take
  // typed digits (also seen natively on WebKitGTK), so it gets the value directly there.
  if (tabKey(page) === 'Tab') await page.keyboard.type('12012026');
  else await page.getByLabel('Project deadline').fill('2026-12-01');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Keyboard project' })).toBeFocused();

  await tabTo(page, 'New Reminder in Keyboard project');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keyboard reminder');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Keyboard reminder' })).toBeFocused();

  await tabTo(page, 'Complete Keyboard reminder');
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Complete Keyboard reminder' })).toBeChecked();

  await tabTo(page, 'Edit reminder Keyboard reminder');
  await page.keyboard.press('Enter');
  await page.keyboard.press(tabKey(page)); await page.keyboard.type('Edited by keyboard');
  await tabTo(page, 'Save reminder');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Edited by keyboard')).toBeVisible();

  await tabTo(page, 'Delete reminder Keyboard reminder');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Undo delete' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Keyboard reminder' })).toBeFocused();

  await page.keyboard.press(tabKey(page) === 'Tab' ? 'Shift+Tab' : 'Alt+Shift+Tab');
  await tabTo(page, 'Search');
  await page.keyboard.press('Enter');
  await page.keyboard.type('edited');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Keyboard reminder' })).toBeFocused();

  await tabTo(page, /^Delete project Keyboard project/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press(tabKey(page));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Keyboard project' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeFocused();
});

async function populate(page: Page) {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill('Focus project with a fairly long name to wrap');
  await page.getByLabel('Project deadline').fill('2026-12-01');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  for (const t of ['Alpha', 'Beta']) {
    await page.getByRole('button', { name: 'New Reminder in Focus project with a fairly long name to wrap' }).click();
    await page.getByLabel('Reminder header').fill(t);
    await page.getByLabel('Due date').fill('2026-11-20');
    await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  }
}

/** Every Tab stop shows a focus indicator and is not covered by anything else. */
async function checkFocusRing(page: Page, stops = 60) {
  const problems: string[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const issue = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 0), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      const visible = r.bottom > 0 && r.top < innerHeight && !!top && (el.contains(top) || top.contains(el));
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40);
      return ring && visible ? null : `${name}: ${ring ? '' : 'no focus indicator '}${visible ? '' : 'obscured or off-screen'}`;
    });
    if (issue) problems.push(issue);
  }
  expect([...new Set(problems)]).toEqual([]);
}

test('every Tab stop has a visible, unobscured focus indicator', async ({ page }) => {
  await page.goto('/');
  await populate(page);
  await page.getByRole('heading', { name: 'Projects' }).click();
  await checkFocusRing(page);
  // With the undo bar showing, focused items must not hide behind it.
  await page.getByRole('button', { name: 'Delete reminder Beta' }).click();
  await checkFocusRing(page);
});

for (const size of ['14', '24']) {
  test(`text size ${size}px fits the minimum 480×400 window in every state`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 400 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Text size' }).selectOption(size);
    await page.keyboard.press('Escape');
    // Also scale the whole UI as OS text scaling does.
    await page.evaluate(s => { document.documentElement.style.fontSize = s === '24' ? '150%' : '100%'; }, size);
    const fits = async (label: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label).toBe(true);
    await fits('empty');
    await populate(page);
    await fits('populated');
    await page.getByRole('button', { name: 'Edit reminder Alpha' }).click();
    await fits('edit form');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Delete reminder Beta' }).click();
    await fits('undo bar');
    for (const panel of ['Search', 'Settings', 'Sounds', 'Themes']) {
      await page.getByRole('button', { name: panel, exact: true }).click();
      await fits(`${panel} panel`);
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeInViewport();
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: /^Delete project Focus project/ }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete project' })).toBeInViewport();
  });
}

test('reduced motion removes transitions, animations, and smooth scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await populate(page);
  await page.getByRole('checkbox', { name: 'Complete Alpha' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const moving = await page.evaluate(() => [...document.querySelectorAll('*')].flatMap(el => {
    const s = getComputedStyle(el);
    const longest = (v: string) => Math.max(...v.split(',').map(t => parseFloat(t) * (t.trim().endsWith('ms') ? 0.001 : 1)));
    const animated = s.animationName !== 'none' && longest(s.animationDuration) > 0.01 && s.animationIterationCount !== '0';
    return longest(s.transitionDuration) > 0.01 || animated ? [`${el.tagName}.${el.className}`.slice(0, 60)] : [];
  }));
  expect([...new Set(moving)]).toEqual([]);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).not.toBe('smooth');
});

test('mute silences every cue; unmuted cues play', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { plays: number }).plays = 0;
    HTMLMediaElement.prototype.play = function () { (window as unknown as { plays: number }).plays++; return Promise.resolve(); };
    localStorage.setItem('swish.preferences.v1', JSON.stringify({ startup: false, audio: { muted: true, volume: 80, startupSound: true, interfaceSound: true, sound: true } }));
  });
  await page.goto('/');
  await populate(page);
  await page.getByRole('checkbox', { name: 'Complete Alpha' }).click();
  for (const panel of ['Search', 'Themes']) { await page.getByRole('button', { name: panel, exact: true }).click(); await page.keyboard.press('Escape'); }
  expect(await page.evaluate(() => (window as unknown as { plays: number }).plays)).toBe(0);

  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Mute all sounds' }).uncheck();
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'Complete Beta' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { plays: number }).plays)).toBeGreaterThan(0);
});
