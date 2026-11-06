import { parseTheme, parseMotion, parseSoundSettings, type ThemeId, type MotionLevel, type SoundSettings } from '@arlecchino/suite-ui';
import { SWISH_SOUND_DEFAULTS } from './sounds';

export type Preferences = { theme: ThemeId; motion: MotionLevel; font: 'mono' | 'system'; size: number; startup: boolean; audio: SoundSettings };
export const TEXT_SIZES = [14, 16, 18, 20, 24] as const;
export const defaults: Preferences = { theme: 'blue', motion: 'full', font: 'mono', size: 16, startup: true, audio: { ...SWISH_SOUND_DEFAULTS } };
export const KEY = 'swish.preferences.v1';

/** Reads stored preferences field by field; anything missing or invalid takes its default. */
export function loadPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!p || typeof p !== 'object') return defaults;
    return {
      theme: parseTheme(p.theme, 'blue'),
      motion: parseMotion(p.motion),
      font: p.font === 'system' ? 'system' : 'mono',
      size: (TEXT_SIZES as readonly number[]).includes(p.size) ? p.size : 16,
      startup: typeof p.startup === 'boolean' ? p.startup : true,
      // Earlier previews stored every cue as off; those flags are not carried over.
      audio: parseSoundSettings(p.audio, SWISH_SOUND_DEFAULTS),
    };
  } catch { return defaults; }
}
