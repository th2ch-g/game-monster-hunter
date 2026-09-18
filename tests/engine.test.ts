import { describe, it, expect } from 'vitest';
import { createWorld, stepWorld, validInput, validWorld, abandon, STEP } from '../src/game/engine';
import { MONSTERS, WEAPONS, type WeaponId } from '../src/game/data';
import { neutral, type World, type Member, type Input } from '../src/game/types';
const member = (weapon: WeaponId = 'longsword', id = 'hunter'): Member => ({
  id,
  name: id,
  weapon,
  level: 0,
  armor: 0,
  ready: true,
  connected: true,
});
const world = (weapon: WeaponId = 'longsword') =>
  createWorld(
    { monster: 'rathalos', difficulty: 'practice', companion: false },
    [member(weapon)],
    'test',
  );
function tick(w: World, input: Partial<Input>, count = 30) {
  for (let i = 0; i < count; i++) stepWorld(w, { hunter: { ...neutral(), ...input } }, STEP);
}
function inRange(w: World) {
  w.monster.mode = 'stagger';
  w.monster.timer = 999;
  w.players[0].x = 0;
  w.players[0].z = -0.5;
  w.players[0].yaw = Math.PI;
}
describe('weapons', () => {
  it.each(WEAPONS)('$name deals damage through authoritative hit detection', (def) => {
    const w = world(def.id);
    inRange(w);
    tick(w, { attack: true, yaw: Math.PI }, 150);
    expect(w.monster.hp).toBeLessThan(w.monster.maxHp);
    expect(w.players[0].damage).toBeGreaterThan(0);
    expect(w.players[0].stamina).toBeGreaterThanOrEqual(0);
  });
  it.each(WEAPONS)('$name has a working special action', (def) => {
    const w = world(def.id);
    inRange(w);
    const p = w.players[0];
    p.gauge = 80;
    p.hp = 60;
    tick(w, { special: true, yaw: Math.PI }, 31);
    tick(w, { yaw: Math.PI }, 120);
    if (['dualblades', 'switchaxe'].includes(def.id)) {
      expect(p.transformed).toBe(true);
    } else if (def.id === 'huntinghorn') {
      expect(p.hp).toBeGreaterThan(60);
      expect(p.buff).toBeGreaterThan(0);
    } else expect(p.damage).toBeGreaterThan(0);
  });
  it('melee attacks cannot hit outside reach or facing', () => {
    const w = world();
    tick(w, { attack: true, yaw: Math.PI }, 90);
    expect(w.players[0].damage).toBe(0);
    const b = world();
    inRange(b);
    tick(b, { attack: true, yaw: 0 }, 60);
    expect(b.players[0].damage).toBe(0);
  });
  it('charged great sword outdamages a normal swing', () => {
    const a = world('greatsword'),
      b = world('greatsword');
    inRange(a);
    inRange(b);
    tick(a, { attack: true, yaw: Math.PI }, 30);
    tick(a, { yaw: Math.PI }, 10);
    tick(b, { special: true, yaw: Math.PI }, 44);
    tick(b, { yaw: Math.PI }, 65);
    expect(b.players[0].damage).toBeGreaterThan(a.players[0].damage * 2);
  });
  it('guard reduces incoming damage and consumes stamina', () => {
    const a = world('lance'),
      b = world('lance');
    for (const w of [a, b]) {
      inRange(w);
      w.difficulty = 'normal';
      w.players[0].invincible = 0;
      w.monster.mode = 'attack';
      w.monster.move = 'bite';
      w.monster.timer = 0.5;
      w.monster.yaw = 0;
    }
    tick(a, { guard: true, yaw: Math.PI }, 1);
    tick(b, { yaw: Math.PI }, 1);
    expect(a.players[0].hp).toBeGreaterThan(b.players[0].hp);
    expect(a.players[0].stamina).toBeLessThan(b.players[0].stamina);
  });
  it('dodge avoids a timed attack and costs stamina', () => {
    const w = world();
    inRange(w);
    w.difficulty = 'normal';
    w.players[0].invincible = 0;
    w.monster.mode = 'attack';
    w.monster.timer = 0.5;
    tick(w, { dodge: true, x: 1, yaw: Math.PI }, 1);
    expect(w.players[0].hp).toBe(w.players[0].maxHp);
    expect(w.players[0].action).toBe('dodge');
    expect(w.players[0].stamina).toBeLessThan(100);
  });
  it('bowguns reload rather than firing empty magazines', () => {
    const w = world('lightbowgun');
    inRange(w);
    w.players[0].ammo = 0;
    tick(w, { attack: true, yaw: Math.PI }, 1);
    expect(w.players[0].action).toBe('reload');
    tick(w, {}, 60);
    expect(w.players[0].ammo).toBe(8);
  });
});
describe('quest lifecycle', () => {
  it.each(MONSTERS)('$name uses its configured attack patterns', (def) => {
    const w = createWorld({ monster: def.id, difficulty: 'practice', companion: false }, [
      member(),
    ]);
    const moves = new Set<string>();
    for (let i = 0; i < 2400; i++) {
      stepWorld(w, {});
      if (w.monster.mode === 'windup') moves.add(w.monster.move);
    }
    expect([...new Set(def.moves)].every((m) => moves.has(m))).toBe(true);
  });
  it('wins and stops simulation at zero monster health', () => {
    const w = world();
    inRange(w);
    w.monster.hp = 1;
    tick(w, { attack: true, yaw: Math.PI }, 60);
    expect(w.phase).toBe('won');
    const time = w.elapsed;
    tick(w, {}, 100);
    expect(w.elapsed).toBe(time);
  });
  it('fails on three carts and on timeout', () => {
    const w = world();
    w.carts = 3;
    tick(w, {}, 1);
    expect(w.phase).toBe('lost');
    const b = world();
    b.elapsed = b.limit;
    tick(b, {}, 1);
    expect(b.phase).toBe('lost');
  });
  it('scales health for cooperating players', () => {
    const a = world();
    const b = createWorld({ monster: 'rathalos', difficulty: 'normal', companion: false }, [
      member(),
      member('bow', 'friend'),
    ]);
    expect(b.monster.maxHp).toBe(a.monster.maxHp * 1.65);
  });
  it('breaks head and severs tail through positioning', () => {
    const w = world('greatsword');
    inRange(w);
    w.monster.hp = w.monster.maxHp = 10000;
    w.monster.head = 1901;
    tick(w, { attack: true, yaw: Math.PI }, 45);
    expect(w.monster.headBroken).toBe(true);
    w.players[0].z = -8;
    w.monster.tail = 1601;
    tick(w, { attack: true, yaw: 0 }, 60);
    expect(w.monster.tailBroken).toBe(true);
  });
  it('revives downed players faster near an ally', () => {
    const a = world(),
      b = createWorld({ monster: 'rathalos', difficulty: 'practice', companion: false }, [
        member(),
        member('bow', 'friend'),
      ]);
    for (const w of [a, b]) {
      w.players[0].action = 'down';
      w.players[0].timer = 7;
      w.players[0].hp = 0;
    }
    b.players[1].x = b.players[0].x;
    b.players[1].z = b.players[0].z;
    tick(a, {}, 30);
    tick(b, {}, 30);
    expect(b.players[0].timer).toBeLessThan(a.players[0].timer);
  });
  it('disconnected members neither act nor take damage', () => {
    const w = world();
    inRange(w);
    w.players[0].connected = false;
    tick(w, { attack: true, yaw: Math.PI }, 120);
    expect(w.players[0].damage).toBe(0);
  });
  it('keeps players within arena bounds and clamps simulation time', () => {
    const w = world();
    tick(w, { x: 1, z: 1 }, 900);
    expect(Math.hypot(w.players[0].x, w.players[0].z)).toBeLessThanOrEqual(38.001);
    const before = w.elapsed;
    stepWorld(w, {}, 2000);
    expect(w.elapsed - before).toBeCloseTo(0.1);
  });
  it('supports explicit retreat', () => {
    const w = world();
    abandon(w);
    expect(w.phase).toBe('lost');
  });
});
describe('items and validation', () => {
  it('healing consumes inventory only when used and restores health after the animation', () => {
    const w = world();
    inRange(w);
    tick(w, { item: 'potion' }, 1);
    expect(w.players[0].items.potion).toBe(8);
    w.players[0].hp = 30;
    tick(w, { item: 'potion' }, 1);
    expect(w.players[0].items.potion).toBe(7);
    expect(w.players[0].hp).toBe(30);
    tick(w, {}, 45);
    expect(w.players[0].hp).toBe(95);
  });
  it('trap immobilizes a nearby monster and is consumed', () => {
    const w = world();
    inRange(w);
    tick(w, { item: 'trap', yaw: Math.PI }, 1);
    tick(w, {}, 40);
    expect(w.monster.mode).toBe('stagger');
    expect(w.players[0].items.trap).toBe(1);
    expect(w.hazards).toHaveLength(0);
  });
  it('bomb damages the monster after its fuse', () => {
    const w = world();
    inRange(w);
    tick(w, { item: 'bomb', yaw: Math.PI }, 1);
    tick(w, {}, 90);
    expect(w.monster.hp).toBeLessThan(w.monster.maxHp);
  });
  it('antidote removes poison and whetstone restores sharpness', () => {
    const w = world();
    inRange(w);
    w.players[0].poison = 8;
    tick(w, { item: 'antidote' }, 1);
    expect(w.players[0].poison).toBe(0);
    tick(w, {}, 30);
    w.players[0].sharpness = 5;
    tick(w, { item: 'whetstone' }, 1);
    tick(w, {}, 90);
    expect(w.players[0].sharpness).toBe(100);
  });
  it('rejects invalid controls and malformed state', () => {
    expect(validInput(neutral())).toBe(true);
    expect(validInput({ ...neutral(), x: 100 })).toBe(false);
    expect(validInput({ ...neutral(), yaw: NaN })).toBe(false);
    expect(validInput({ ...neutral(), item: 'cheat' })).toBe(false);
    expect(validWorld(null)).toBe(false);
    expect(validWorld(world())).toBe(true);
  });
});
describe('network state boundaries', () => {
  it('rejects malformed snapshots before they reach the renderer', () => {
    const a = world();
    a.monster.x = NaN;
    expect(validWorld(a)).toBe(false);
    const b = world();
    b.players[0].items = null as unknown as (typeof b.players)[0]['items'];
    expect(validWorld(b)).toBe(false);
    const c = world();
    c.players[0].stamina = Infinity;
    expect(validWorld(c)).toBe(false);
    const d = world();
    d.players.push({ ...d.players[0] });
    expect(validWorld(d)).toBe(false);
  });
  it('queues an item during an attack and consumes it only once', () => {
    const w = world();
    inRange(w);
    w.players[0].hp = 30;
    tick(w, { attack: true, yaw: Math.PI }, 1);
    tick(w, { item: 'potion' }, 1);
    tick(w, {}, 90);
    expect(w.players[0].hp).toBe(95);
    expect(w.players[0].items.potion).toBe(7);
  });
  it('a sword and shield special lands three separate hits', () => {
    const w = world('swordshield');
    inRange(w);
    tick(w, { special: true, yaw: Math.PI }, 1);
    tick(w, { yaw: Math.PI }, 50);
    expect(w.counter).toBe(3);
  });
});
