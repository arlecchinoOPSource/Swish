import { test, expect } from '@playwright/test';
import { NO_PLAYBACK_REASON, noPlayback, prefs, spyOnAudio, started } from './audio-spy';

async function addReminder(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: 'New Reminder in Regular Reminders' }).click();
  await page.getByLabel('Reminder header').fill(title);
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test.describe('when audio may start at launch (as in the desktop app; simulated here)', () => {
  test('sound is on by default and the shared startup sound plays once at launch', async ({ page, browserName }) => {
  test.skip(noPlayback(browserName), NO_PLAYBACK_REASON);
    await spyOnAudio(page, { allowAtLaunch: true });
    await page.goto('/');
    await expect.poll(() => started(page)).toEqual(['startup']);
    await page.getByRole('button', { name: 'Sounds', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Sound' })).toBeChecked();
    await page.reload();
    await expect.poll(() => started(page)).toEqual(['startup']);
  });
  test('switching Startup off keeps the next launch silent', async ({ page }) => {
    await spyOnAudio(page, { allowAtLaunch: true });
    await prefs(page, { audio: { enabled: true, startup: false } });
    await page.goto('/');
    await page.waitForTimeout(800);
    expect(await started(page)).toEqual([]);
  });
});

test('interface clicks and completion play their shared cues', async ({ page, browserName }) => {
  test.skip(noPlayback(browserName), NO_PLAYBACK_REASON);
  await spyOnAudio(page);
  await prefs(page, { startup: false });
  await page.goto('/');
  await addReminder(page, 'Listen');
  await page.getByRole('checkbox', { name: 'Complete Listen' }).click();
  await expect.poll(async () => (await started(page)).includes('completion')).toBe(true);
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await expect.poll(async () => (await started(page)).filter(s => s === 'interface').length).toBeGreaterThan(1);
});

test('the master switch silences every cue; previews still play; each cue has its own switch', async ({ page, browserName }) => {
  test.skip(noPlayback(browserName), NO_PLAYBACK_REASON);
  await spyOnAudio(page);
  await prefs(page, { startup: false });
  await page.goto('/');
  await addReminder(page, 'Quiet');
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  const master = page.getByRole('switch', { name: 'Sound' });
  await master.uncheck();
  await expect(page.getByText('OFF', { exact: true })).toBeVisible();
  const before = (await started(page)).length;
  await page.getByRole('button', { name: 'Preview Close sound' }).click();
  await expect.poll(async () => (await started(page)).slice(before)).toEqual(['close']);
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'Complete Quiet' }).click();
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.waitForTimeout(400);
  expect((await started(page)).slice(before)).toEqual(['close']);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await master.check();
  await page.getByRole('checkbox', { name: /^Completion/ }).uncheck();
  await page.keyboard.press('Escape');
  const mark = (await started(page)).length;
  await page.getByRole('checkbox', { name: 'Complete Quiet' }).click();
  await page.getByRole('checkbox', { name: 'Complete Quiet' }).click();
  await page.waitForTimeout(400);
  expect((await started(page)).slice(mark)).not.toContain('completion');
});

test('volume and switches persist; earlier all-off settings no longer leave Swish silent', async ({ page }) => {
  await prefs(page, { startup: false, audio: { muted: false, volume: 40, startupSound: false, interfaceSound: false, sound: false } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Sound' })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Master volume' })).toHaveValue('40');
  await page.getByRole('slider', { name: 'Master volume' }).focus();
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Master volume' })).toHaveValue('85');
  await page.getByRole('checkbox', { name: /^Error/ }).uncheck();
  await page.reload();
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Master volume' })).toHaveValue('85');
  await expect(page.getByRole('checkbox', { name: /^Error/ })).not.toBeChecked();
});

test('a missing audio device never blocks the app', async ({ page }) => {
  await spyOnAudio(page, { breakAudio: true });
  await page.goto('/');
  await addReminder(page, 'Still works');
  await page.getByRole('checkbox', { name: 'Complete Still works' }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Still works' })).toBeChecked();
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Completion sound' }).click();
  await expect(page.getByRole('switch', { name: 'Sound' })).toBeVisible();
});
