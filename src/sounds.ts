import { createSoundManager, DEFAULT_SOUND_SETTINGS, type SoundSettings } from '@arlecchino/suite-ui';

/**
 * Swish's one sound manager (Core's Web Audio engine with the shared Arlecchino
 * startup, close, interface, completion, and error sounds). Swish ships with sound on:
 * the owner chose to hear the identity sounds by default.
 */
export const SWISH_SOUND_DEFAULTS: Readonly<SoundSettings> = Object.freeze({ ...DEFAULT_SOUND_SETTINGS, enabled: true });
export const sounds = createSoundManager();
