import { describe, it, expect } from 'vitest';
import { claimReward, freshProfile, upgrade } from '../src/lib/storage';
import { createWorld } from '../src/game/engine';
const makeWorld = () =>
  createWorld(
    { monster: 'rathalos', difficulty: 'normal', companion: false },
    [
      {
        id: 'test',
        name: 'Hunter',
        weapon: 'longsword',
        armor: 0,
        level: 0,
        ready: true,
        connected: true,
      },
    ],
    'quest-1',
  );
describe('persistent progress', () => {
  it('awards a completed hunt exactly once', () => {
    const w = makeWorld();
    w.phase = 'won';
    w.monster.headBroken = true;
    w.elapsed = 70;
    const p = claimReward(freshProfile(), w);
    expect(p.zenny).toBe(1500);
    expect(p.materials.rathalos).toBe(4);
    expect(p.records.rathalos).toBe(70);
    expect(claimReward(p, w)).toEqual(p);
  });
  it('never awards training or unfinished quests', () => {
    const w = makeWorld(),
      p = freshProfile();
    expect(claimReward(p, w)).toEqual(p);
    w.phase = 'won';
    w.difficulty = 'practice';
    expect(claimReward(p, w)).toEqual(p);
  });
  it('loss records a hunt without currency rewards', () => {
    const w = makeWorld();
    w.phase = 'lost';
    const p = claimReward(freshProfile(), w);
    expect(p.hunts).toBe(1);
    expect(p.zenny).toBe(600);
    expect(p.victories).toBe(0);
  });
  it('upgrades consume currency and materials atomically', () => {
    const p = freshProfile();
    const u = upgrade(p, 'longsword', 'rathalos')!;
    expect(u.ranks.longsword).toBe(1);
    expect(u.zenny).toBe(250);
    expect(p.zenny).toBe(600);
    expect(upgrade(u, 'longsword', 'rathalos')).toBeNull();
    u.zenny = 2000;
    u.materials.rathalos = 2;
    const b = upgrade(u, 'longsword', 'rathalos')!;
    expect(b.ranks.longsword).toBe(2);
    expect(b.materials.rathalos).toBe(1);
    expect(b.zenny).toBe(1200);
  });
  it('caps equipment at level six', () => {
    const p = freshProfile();
    p.armor = 5;
    p.zenny = 1e6;
    expect(upgrade(p, 'armor', 'rathalos')).toBeNull();
  });
});
