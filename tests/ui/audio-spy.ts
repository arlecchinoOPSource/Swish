import type { Page } from '@playwright/test';

/**
 * Records every sound that actually starts through Web Audio, by bundled file name
 * (e.g. "completion"). Real decoding runs, so this also proves the files decode.
 */
export async function spyOnAudio(page: Page, options: { breakAudio?: boolean; allowAtLaunch?: boolean } = {}) {
  await page.addInitScript(({ breakAudio, allowAtLaunch }) => {
    const w = window as unknown as { started: string[] };
    w.started = [];
    if (breakAudio) {
      (window as unknown as { AudioContext: unknown }).AudioContext = function () { throw new Error('No audio device'); };
      return;
    }
    // Browsers hold audio until the first click; the desktop app's web view does not.
    if (allowAtLaunch) Object.defineProperty(BaseAudioContext.prototype, 'state', { get: () => 'running' });
    const urls = new WeakMap<ArrayBuffer, string>();
    const names = new WeakMap<AudioBuffer, string>();
    const fetch0 = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await fetch0(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const arrayBuffer = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => { const data = await arrayBuffer(); urls.set(data, url); return data; };
      return response;
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (data: ArrayBuffer, ...rest: never[]) {
      const url = urls.get(data) ?? '';
      return (decode as (d: ArrayBuffer, ...r: never[]) => Promise<AudioBuffer>).call(this, data, ...rest).then(buffer => {
        names.set(buffer, url.split('/').pop()!.replace(/\.wav.*$/, '').replace(/-[\w-]{8}$/, ''));
        return buffer;
      });
    } as typeof decode;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer) w.started.push(names.get(this.buffer) ?? 'unknown');
      return start.apply(this, args);
    };
  }, options);
}

export const started = (page: Page) => page.evaluate(() => (window as unknown as { started: string[] }).started);
/** Seeds stored preferences once; later reloads keep whatever the app saved. */
export const prefs = (page: Page, value: object) => page.addInitScript(v => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem('swish.preferences.v1', JSON.stringify(v));
}, value);

/**
 * Playwright's WebKit build on Windows cannot play audio (recorded in PR #22). It is not
 * a shipped engine: the Windows app uses WebView2 (Chromium) and the macOS app WebKit,
 * both of which run these playback checks. Only playback assertions are excluded.
 */
export const NO_PLAYBACK_REASON = 'Windows WebKit cannot play audio; Windows ships WebView2 (Chromium) and macOS WebKit, both checked.';
export const noPlayback = (browserName: string) => process.platform === 'win32' && browserName === 'webkit';
