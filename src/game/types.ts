import type { MonsterId, WeaponId, Move, Item, Difficulty } from './data';
export interface Input {
  x: number;
  z: number;
  yaw: number;
  attack: boolean;
  special: boolean;
  dodge: boolean;
  guard: boolean;
  item: Item | null;
}
export const neutral = (): Input => ({
  x: 0,
  z: 0,
  yaw: 0,
  attack: false,
  special: false,
  dodge: false,
  guard: false,
  item: null,
});
export interface Member {
  id: string;
  name: string;
  weapon: WeaponId;
  level: number;
  armor: number;
  ready: boolean;
  connected: boolean;
}
export interface Player extends Member {
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  stamina: number;
  action: 'idle' | 'attack' | 'special' | 'dodge' | 'hurt' | 'heal' | 'reload' | 'down' | 'sharpen';
  timer: number;
  duration: number;
  hit: boolean;
  combo: number;
  comboTimer: number;
  invincible: number;
  gauge: number;
  charge: number;
  transformed: boolean;
  buff: number;
  damage: number;
  sharpness: number;
  ammo: number;
  poison: number;
  lastHit: number;
  items: Record<Item, number>;
  previousSpecial: boolean;
  pendingItem: Item | null;
  attackHits: number;
  bot: boolean;
  revive: number;
}
export interface Beast {
  id: MonsterId;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  mode: 'stalk' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';
  timer: number;
  duration: number;
  move: Move;
  sequence: number;
  targetX: number;
  targetZ: number;
  enraged: boolean;
  stagger: number;
  head: number;
  tail: number;
  headBroken: boolean;
  tailBroken: boolean;
  attackId: number;
}
export interface Effect {
  id: number;
  type: 'hit' | 'heal' | 'break' | 'shot' | 'blast' | 'cart' | 'buff';
  x: number;
  z: number;
  value: number;
  life: number;
  owner: string;
}
export interface Hazard {
  id: number;
  type: 'fire' | 'thunder' | 'trap' | 'bomb';
  x: number;
  z: number;
  radius: number;
  delay: number;
  life: number;
  owner: string;
}
export interface World {
  version: 1;
  id: string;
  phase: 'playing' | 'won' | 'lost';
  monster: Beast;
  players: Player[];
  elapsed: number;
  limit: number;
  carts: number;
  maxCarts: number;
  difficulty: Difficulty;
  effects: Effect[];
  hazards: Hazard[];
  counter: number;
  notice: string;
  noticeTime: number;
}
export interface HuntConfig {
  monster: MonsterId;
  difficulty: Difficulty;
  companion: boolean;
}
