import { MONSTERS, WEAPONS, monster, type WeaponId, type MonsterId } from '../game/data';
import type { World } from '../game/types';
export interface Profile {
  version: 1;
  name: string;
  weapon: WeaponId;
  zenny: number;
  ranks: Record<string, number>;
  armor: number;
  materials: Record<string, number>;
  hunts: number;
  victories: number;
  records: Record<string, number>;
  claimed: string[];
}
export interface Settings {
  sound: boolean;
  volume: number;
  quality: 'auto' | 'high' | 'low';
  sensitivity: number;
  shake: boolean;
  companion: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.35,
  quality: 'auto',
  sensitivity: 1,
  shake: true,
  companion: true,
};
export const freshProfile = (): Profile => ({
  version: 1,
  name: 'HUNTER',
  weapon: 'longsword',
  zenny: 600,
  ranks: {},
  armor: 0,
  materials: {},
  hunts: 0,
  victories: 0,
  records: {},
  claimed: [],
});
export function read<T>(key: string, fallback: T, session = false): T {
  try {
    return (
      JSON.parse((session ? sessionStorage : localStorage).getItem(`guild:${key}`) || 'null') ??
      fallback
    );
  } catch {
    return fallback;
  }
}
export function write(key: string, value: unknown, session = false) {
  try {
    (session ? sessionStorage : localStorage).setItem(`guild:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function remove(key: string, session = false) {
  try {
    (session ? sessionStorage : localStorage).removeItem(`guild:${key}`);
  } catch {
    /* Storage may be unavailable. */
  }
}
const bounded = (n: unknown, max: number) =>
  Number.isInteger(n) && Number(n) >= 0 && Number(n) <= max;
export function loadProfile(): Profile {
  const p = read<Profile | null>('profile', null);
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== 'string' ||
    !WEAPONS.some((w) => w.id === p.weapon) ||
    !bounded(p.zenny, 1e9) ||
    !bounded(p.armor, 5) ||
    !bounded(p.hunts, 1e9) ||
    !bounded(p.victories, 1e9) ||
    !p.ranks ||
    !p.materials ||
    !p.records ||
    !Array.isArray(p.claimed)
  )
    return freshProfile();
  return {
    ...freshProfile(),
    ...p,
    name: p.name.slice(0, 16),
    ranks: Object.fromEntries(
      WEAPONS.map((w) => [w.id, bounded(p.ranks[w.id], 5) ? p.ranks[w.id] : 0]),
    ),
    materials: Object.fromEntries(
      MONSTERS.map((m) => [m.id, bounded(p.materials[m.id], 1e6) ? p.materials[m.id] : 0]),
    ),
    records: Object.fromEntries(
      MONSTERS.filter(
        (m) =>
          typeof p.records[m.id] === 'number' &&
          Number.isFinite(p.records[m.id]) &&
          p.records[m.id] > 0,
      ).map((m) => [m.id, p.records[m.id]]),
    ),
    claimed: p.claimed.filter((x) => typeof x === 'string').slice(-100),
  };
}
export function loadSettings(): Settings {
  const s = read<Partial<Settings>>('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    quality: ['auto', 'high', 'low'].includes(s.quality || '') ? s.quality! : 'auto',
    volume:
      typeof s.volume === 'number' && Number.isFinite(s.volume)
        ? Math.max(0, Math.min(1, s.volume))
        : 0.35,
    sensitivity:
      typeof s.sensitivity === 'number' && Number.isFinite(s.sensitivity)
        ? Math.max(0.3, Math.min(2, s.sensitivity))
        : 1,
  };
}
export function claimReward(profile: Profile, w: World): Profile {
  if (w.phase === 'playing' || w.difficulty === 'practice' || profile.claimed.includes(w.id))
    return profile;
  const p = structuredClone(profile);
  p.hunts++;
  p.claimed = [...p.claimed, w.id].slice(-100);
  if (w.phase === 'won') {
    p.victories++;
    const m = monster(w.monster.id);
    p.zenny += Math.round(m.reward * (w.difficulty === 'veteran' ? 1.5 : 1));
    p.materials[m.id] =
      (p.materials[m.id] || 0) + 3 + Number(w.monster.headBroken) + Number(w.monster.tailBroken);
    p.records[m.id] = Math.min(p.records[m.id] || Infinity, w.elapsed);
  }
  return p;
}
export const upgradeCost = (level: number) => 350 + level * 450;
export function upgrade(
  profile: Profile,
  kind: WeaponId | 'armor',
  material: MonsterId,
): Profile | null {
  const lv = kind === 'armor' ? profile.armor : profile.ranks[kind] || 0;
  if (
    lv >= 5 ||
    profile.zenny < upgradeCost(lv) ||
    (lv > 0 && (profile.materials[material] || 0) < lv)
  )
    return null;
  const p = structuredClone(profile);
  p.zenny -= upgradeCost(lv);
  if (lv > 0) p.materials[material] -= lv;
  if (kind === 'armor') p.armor++;
  else p.ranks[kind] = lv + 1;
  return p;
}
export function downloadProfile(profile: Profile) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hunters-guild-save.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
