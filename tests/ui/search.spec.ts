import { test, expect, type Page } from '@playwright/test';

async function createProject(page: Page, name: string, description = '') {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  if (description) await page.getByLabel('Description').fill(description);
  await page.getByLabel('Project deadline').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function createReminder(page: Page, opener: string, title: string, text = '') {
  await page.getByRole('button', { name: opener }).click();
  await page.getByLabel('Reminder header').fill(title);
  if (text) await page.getByLabel('Reminder text').fill(text);
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

const openSearch = (page: Page) => page.getByRole('button', { name: 'Search', exact: true }).click();
const results = (page: Page) => page.getByRole('listbox', { name: 'Search results' }).getByRole('option');
const message = (page: Page) => page.getByRole('dialog').getByRole('status');

test('normalization folds case, accents, width, and spacing', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const m = await import('/src/search.ts');
    return {
      a: m.normalize('  Café   CRÈME\tbrûlée '),
      b: m.normalize('ｃａｆｅ'),
      c: m.terms('Café cafe  CAFE'),
      d: m.highlightRanges('Crème brûlée', m.terms('creme BRULEE')),
      e: m.highlightRanges('👍 Café', m.terms('cafe')),
    };
  });
  expect(out.a).toBe('cafe creme brulee');
  expect(out.b).toBe('cafe');
  expect(out.c).toEqual(['cafe']);
  expect(out.d).toEqual([[0, 5], [6, 12]]);
  expect(out.e).toEqual([[3, 7]]);
});

test('finds names, headers, and text with project context, completed state, and highlights', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic Café Tour', 'Bookings for the spring leg');
  await createReminder(page, 'New Reminder in Synthetic Café Tour', 'Confirm venues', 'Call the café in Lyon about the sound check');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Cafe receipts');
  await page.getByRole('checkbox', { name: 'Complete Cafe receipts' }).click();
  await openSearch(page);
  const box = page.getByRole('combobox', { name: 'Search projects and reminders' });
  await expect(box).toBeFocused();
  await expect(message(page)).toHaveText('Type to search projects and reminders.');

  await box.fill('CAFE');
  await expect(message(page)).toHaveText('3 MATCHES · ENTER TO OPEN');
  await expect(results(page).nth(0)).toContainText('Synthetic Café Tour');
  await expect(results(page).nth(0)).toContainText('PROJECT');
  await expect(results(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(results(page).nth(1)).toContainText('Cafe receipts');
  await expect(results(page).nth(1)).toContainText('✓ DONE');
  await expect(results(page).nth(1)).toContainText('In Regular Reminders');
  await expect(results(page).nth(2)).toContainText('Confirm venues');
  await expect(results(page).nth(2)).toContainText('In project Synthetic Café Tour');
  await expect(results(page).nth(2).locator('mark')).toHaveText('café');

  await box.fill('lyon sound');
  await expect(results(page)).toHaveCount(1);
  await box.fill('spring');
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).first().locator('.result-snippet mark')).toHaveText('spring');
});

test('no-match and clear states', async ({ page }) => {
  await page.goto('/');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Synthetic only');
  await openSearch(page);
  const box = page.getByRole('combobox', { name: 'Search projects and reminders' });
  await box.fill('zebra');
  await expect(message(page)).toHaveText('No matches for “zebra”.');
  await expect(page.getByRole('listbox', { name: 'Search results' })).toHaveCount(0);
  await box.fill('');
  await expect(box).toBeFocused();
  await expect(message(page)).toHaveText('Type to search projects and reminders.');
});

test('keyboard moves the highlight and Enter opens the result on the canvas', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic far away');
  for (let i = 1; i <= 5; i++) await createReminder(page, 'New Reminder in Synthetic far away', `Filler ${i}`, 'Long body '.repeat(40));
  await createReminder(page, 'New Reminder in Regular Reminders', 'Needle at the bottom');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Needle twin');
  await page.getByRole('heading', { name: 'Projects' }).scrollIntoViewIfNeeded();
  await openSearch(page);
  await page.keyboard.type('needle');
  const box = page.getByRole('combobox', { name: 'Search projects and reminders' });
  await expect(results(page).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(results(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(box).toHaveAttribute('aria-activedescendant', (await results(page).nth(1).getAttribute('id'))!);
  await expect(box).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(results(page).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const target = page.getByRole('heading', { name: 'Needle at the bottom' });
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  await expect(page.locator('article[data-search-hit]')).toHaveCount(1);
  // The query is kept for the next search.
  await openSearch(page);
  await expect(box).toHaveValue('needle');
});

test('long text produces a bounded excerpt and results stay inside a small window', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 400 });
  await page.goto('/');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Long body', `${'start '.repeat(60)}findme${' end'.repeat(60)}`);
  await openSearch(page);
  await page.getByRole('combobox', { name: 'Search projects and reminders' }).fill('findme');
  const snippet = results(page).first().locator('.result-snippet');
  await expect(snippet.locator('mark')).toHaveText('findme');
  expect((await snippet.textContent())!.length).toBeLessThan(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
