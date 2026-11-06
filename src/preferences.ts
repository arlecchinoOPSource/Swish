import { parseTheme, parseMotion, type ThemeId, type MotionLevel, type SoundSettings } from '@arlecchino/suite-ui';
export type Preferences = { theme: ThemeId; motion: MotionLevel; font: 'mono' | 'system'; size: number; startup: boolean; audio: SoundSettings };
export const defaults: Preferences = { theme: 'blue', motion: 'full', font: 'mono', size: 16, startup: true, audio: { muted: false, volume: 70, startupSound: false, interfaceSound: false, sound: false } };
export const KEY = 'swish.preferences.v1';
export function loadPreferences(): Preferences {
 try {
 const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
 if (!p || typeof p !== 'object') return defaults;
 const a = p.audio ?? {};
 const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
 return { theme: parseTheme(p.theme, 'blue'), motion: parseMotion(p.motion), font: p.font === 'system' ? 'system' : 'mono', size: [14,16,18,20,24].includes(p.size) ? p.size : 16, startup: bool(p.startup,true), audio: { muted: bool(a.muted,false), volume: typeof a.volume === 'number' && Number.isFinite(a.volume) ? Math.max(0,Math.min(100,a.volume)) : 70, startupSound: bool(a.startupSound,false), interfaceSound: bool(a.interfaceSound,false), sound: bool(a.sound,false) } };
 } catch { return defaults; }
}
