import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Project deadline').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function createReminder(page: Page, opener: string, title: string) {
  await page.getByRole('button', { name: opener }).click();
  await page.getByLabel('Reminder header').fill(title);
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

const settings = (page: Page) => page.getByRole('button', { name: 'Settings', exact: true }).click();

async function exportBackup(page: Page): Promise<string> {
  await settings(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup…' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^swish-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await file.path())!, 'utf8');
  await page.keyboard.press('Escape');
  return text;
}

async function chooseFile(page: Page, name: string, text: string) {
  await settings(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from backup…' }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('export writes a versioned file with every field and no extras', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic export');
  await createReminder(page, 'New Reminder in Synthetic export', 'Packed');
  await page.getByRole('checkbox', { name: 'Complete Packed' }).click();
  const backup = JSON.parse(await exportBackup(page));
  expect(Object.keys(backup).sort()).toEqual(['exportedAt', 'format', 'projects', 'reminders', 'schemaVersion', 'version']);
  expect(backup).toMatchObject({ format: 'swish-backup', version: 1, schemaVersion: 1 });
  expect(backup.projects).toHaveLength(1);
  expect(backup.reminders[0]).toMatchObject({ title: 'Packed', projectId: backup.projects[0].id });
  expect(backup.reminders[0].completedAt).toMatch(/Z$/);
  await settings(page);
  await expect(page.getByRole('dialog')).toContainText('Nothing is uploaded.');
});

test('restore confirms counts, replaces everything, and can be undone', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'From the backup');
  await createReminder(page, 'New Reminder in From the backup', 'Backed-up reminder');
  const text = await exportBackup(page);
  const ids = JSON.parse(text).reminders.map((r: { id: string }) => r.id);

  await createReminder(page, 'New Regular Reminder', 'Added after export');
  await createReminder(page, 'New Regular Reminder', 'Also added after export');
  await chooseFile(page, 'my-backup.json', text);
  const dialog = page.getByRole('dialog', { name: 'Replace all data with this backup?' });
  await expect(dialog).toContainText('my-backup.json');
  await expect(dialog).toContainText('1 project and 1 reminder.');
  await expect(dialog).toContainText('Your current 1 project and 3 reminders will be replaced.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Replace with backup' }).click();

  await expect(page.getByRole('status', { name: 'Restore complete' })).toContainText('Restored 1 project and 1 reminder from my-backup.json');
  await expect(page.getByRole('heading', { name: 'Added after export', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Backed-up reminder' })).toHaveAttribute('id', `reminder-${ids[0]}`);

  await page.getByRole('button', { name: 'Undo restore' }).click();
  await expect(page.getByRole('heading', { name: 'Added after export', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Also added after export' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Restore complete' })).toHaveCount(0);
});

test('cancelling the confirmation or the file picker changes nothing', async ({ page }) => {
  await page.goto('/');
  await createReminder(page, 'New Regular Reminder', 'Stays put');
  const text = await exportBackup(page);
  await createReminder(page, 'New Regular Reminder', 'Also stays');
  await chooseFile(page, 'b.json', text);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Also stays' })).toBeVisible();
  await chooseFile(page, 'b.json', text);
  await expect(page.getByRole('dialog', { name: 'Replace all data with this backup?' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Replace all data with this backup?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Also stays' })).toBeVisible();
});

const project = (id: string) => ({ id, name: 'P', description: '', deadline: '2026-12-31', createdAt: '2026-11-06T10:00:00.000Z', updatedAt: '2026-11-06T10:00:00.000Z' });
const reminder = (id: string, projectId: string | null) => ({ id, projectId, title: 'R', text: '', dueDate: null, completedAt: null, createdAt: '2026-11-06T10:00:00.000Z', updatedAt: '2026-11-06T10:00:00.000Z' });
const P1 = '11111111-1111-4111-8111-111111111111';
const R1 = '22222222-2222-4222-8222-222222222222';
const envelope = (extra: object) => JSON.stringify({ format: 'swish-backup', version: 1, schemaVersion: 1, exportedAt: '2026-11-06T10:00:00.000Z', projects: [], reminders: [], ...extra });

for (const [label, text, message] of [
  ['not JSON', '{ broken', 'not a readable Swish backup'],
  ['another app', JSON.stringify({ format: 'ember-journal', version: 1 }), 'not a Swish backup'],
  ['newer format', envelope({ version: 2 }), 'newer version of Swish'],
  ['old format', envelope({ version: 0 }), 'not supported'],
  ['duplicate project IDs', envelope({ projects: [project(P1), project(P1)] }), 'repeats an identifier'],
  ['duplicate reminder IDs', envelope({ reminders: [reminder(R1, null), reminder(R1, null)] }), 'repeats an identifier'],
  ['dangling project reference', envelope({ reminders: [reminder(R1, P1)] }), 'not in the backup'],
  ['impossible date', envelope({ projects: [{ ...project(P1), deadline: '2026-02-30' }] }), 'Deadline'],
  ['unknown field', envelope({ projects: [{ ...project(P1), extra: 1 }] }), 'damaged or incomplete'],
] as const) {
  test(`rejects a backup with ${label} and changes nothing`, async ({ page }) => {
    await page.goto('/');
    await createReminder(page, 'New Regular Reminder', 'Untouched');
    await chooseFile(page, 'bad.json', text);
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(message);
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Nothing was changed.');
    await expect(page.getByRole('dialog', { name: 'Replace all data with this backup?' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Untouched' })).toBeVisible();
  });
}

test('a failed restore keeps the confirmation open and retry succeeds', async ({ page }) => {
  await page.goto('/');
  await createReminder(page, 'New Regular Reminder', 'Original');
  const text = envelope({ reminders: [reminder(R1, null)] });
  await chooseFile(page, 'ok.json', text);
  await page.evaluate(() => { window.__swishPreviewFault = 'write'; });
  const dialog = page.getByRole('dialog', { name: 'Replace all data with this backup?' });
  await dialog.getByRole('button', { name: 'Replace with backup' }).click();
  await expect(dialog.getByRole('alert')).toContainText('simulated a storage failure');
  await expect(page.getByRole('heading', { name: 'Original' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry: Replace with backup' }).click();
  await expect(page.getByRole('heading', { name: 'R', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Original' })).toHaveCount(0);
});
