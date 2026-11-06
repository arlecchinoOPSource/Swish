import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Builds a canvas with every kind of item and state. */
async function populate(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00'));
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill('Synthetic audit project');
  await page.getByLabel('Description').fill('Description text for contrast checks.');
  await page.getByLabel('Project deadline').fill('2026-11-01');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  for (const [title, due] of [['Overdue item', '2026-11-05'], ['Due today item', '2026-11-06'], ['Done item', '']]) {
    await page.getByRole('button', { name: 'New Reminder in Synthetic audit project' }).click();
    await page.getByLabel('Reminder header').fill(title);
    if (due) await page.getByLabel('Due date').fill(due);
    await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  }
  await page.getByRole('checkbox', { name: 'Complete Done item' }).click();
  await page.getByRole('button', { name: 'New Reminder in Regular Reminders' }).click();
  await page.getByLabel('Reminder header').fill('Regular item');
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
}

async function audit(page: Page, label: string) {
  // Panels fade in from half opacity; audit the settled interface, not a frame mid-animation.
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.length}× — ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

for (const theme of ['Blue Monitor', 'Terminal Mint', 'Ember Orange', 'Amber Display']) {
  test(`no WCAG A/AA violations across states — ${theme}`, async ({ page }) => {
    // About ten full audits, each after animations settle: give slower CI runners room.
    test.setTimeout(120_000);
    await populate(page);
    if (theme !== 'Blue Monitor') {
      await page.getByRole('button', { name: 'Themes', exact: true }).click();
      await page.getByRole('option', { name: new RegExp(`^${theme}`) }).click();
      await page.keyboard.press('Escape');
    }
    await audit(page, 'populated canvas');
    await page.getByRole('button', { name: 'Edit reminder Regular item' }).click();
    await page.getByLabel('Reminder header').fill('');
    await page.getByRole('button', { name: 'Save reminder' }).click();
    await audit(page, 'form with validation error');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByLabel('Search projects and reminders').fill('item');
    await audit(page, 'search results');
    await page.keyboard.press('Escape');
    for (const panel of ['Settings', 'Sounds', 'Themes']) {
      await page.getByRole('button', { name: panel, exact: true }).click();
      await audit(page, `${panel} panel`);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Delete reminder Regular item' }).click();
    await audit(page, 'undo bar');
    await page.getByRole('button', { name: /^Delete project Synthetic audit project/ }).click();
    await audit(page, 'delete confirmation');
  });
}

test('empty and storage-error states have no violations', async ({ page }) => {
  await page.goto('/');
  await audit(page, 'empty canvas');
  await page.addInitScript(() => { window.__swishPreviewFault = 'load'; });
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await audit(page, 'load error');
});
