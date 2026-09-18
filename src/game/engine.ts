import { ITEMS, MONSTERS, WEAPONS, monster, weapon, type Item } from './data';
import {
  neutral,
  type Beast,
  type HuntConfig,
  type Input,
  type Member,
  type Player,
  type World,
} from './types';
export const ARENA_RADIUS = 38;
export const STEP = 1 / 30;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function createPlayer(member: Member, index: number): Player {
  return {
    ...member,
    x: (index - 1) * 2.5,
    z: 15 + index,
    yaw: Math.PI,
    hp: 120 + member.armor * 15,
    maxHp: 120 + member.armor * 15,
    stamina: 100,
    action: 'idle',
    timer: 0,
    duration: 0,
    hit: false,
    combo: 0,
    comboTimer: 0,
    invincible: 2,
    gauge: 0,
    charge: 0,
    transformed: false,
    buff: 0,
    damage: 0,
    sharpness: 100,
    ammo: member.weapon === 'heavybowgun' ? 5 : 8,
    poison: 0,
    lastHit: -1,
    items: { potion: 8, antidote: 3, trap: 2, bomb: 3, whetstone: 8 },
    previousSpecial: false,
    pendingItem: null,
    attackHits: 0,
    bot: false,
    revive: 0,
  };
}
export function createWorld(
  config: HuntConfig,
  members: Member[],
  id = `hunt-${Date.now()}`,
): World {
  const d = monster(config.monster),
    count = members.length;
  const maxHp = Math.round(
    d.hp * (1 + (count - 1) * 0.65) * (config.difficulty === 'veteran' ? 1.65 : 1),
  );
  const players = members.map(createPlayer);
  if (config.companion && count === 1) {
    const bot = createPlayer(
      {
        id: 'palico',
        name: 'オトモ・コハク',
        weapon: 'swordshield',
        level: 0,
        armor: 0,
        ready: true,
        connected: true,
      },
      1,
    );
    bot.bot = true;
    bot.maxHp = bot.hp = 180;
    players.push(bot);
  }
  return {
    version: 1,
    id,
    phase: 'playing',
    monster: {
      id: d.id,
      x: 0,
      z: -4,
      yaw: 0,
      hp: maxHp,
      maxHp,
      mode: 'stalk',
      timer: 2,
      duration: 2,
      move: 'bite',
      sequence: 0,
      targetX: 0,
      targetZ: 0,
      enraged: false,
      stagger: 0,
      head: 0,
      tail: 0,
      headBroken: false,
      tailBroken: false,
      attackId: 0,
    },
    players,
    elapsed: 0,
    limit: config.difficulty === 'practice' ? 3600 : 900,
    carts: 0,
    maxCarts: 3,
    difficulty: config.difficulty,
    effects: [],
    hazards: [],
    counter: 0,
    notice: '狩猟開始 — モンスターを討伐せよ',
    noticeTime: 5,
  };
}
export function validInput(value: unknown): value is Input {
  const x = value as Input;
  return (
    !!x &&
    typeof x === 'object' &&
    Number.isFinite(x.x) &&
    Math.abs(x.x) <= 1.01 &&
    Number.isFinite(x.z) &&
    Math.abs(x.z) <= 1.01 &&
    Number.isFinite(x.yaw) &&
    Math.abs(x.yaw) < 100 &&
    ['attack', 'special', 'dodge', 'guard'].every(
      (k) => typeof x[k as keyof Input] === 'boolean',
    ) &&
    (x.item === null || ITEMS.includes(x.item))
  );
}
export function validMember(value: unknown): value is Member {
  const p = value as Member;
  return (
    !!p &&
    typeof p.id === 'string' &&
    /^[a-zA-Z0-9-]{1,64}$/.test(p.id) &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    p.name.length <= 16 &&
    WEAPONS.some((w) => w.id === p.weapon) &&
    Number.isInteger(p.level) &&
    p.level >= 0 &&
    p.level <= 5 &&
    Number.isInteger(p.armor) &&
    p.armor >= 0 &&
    p.armor <= 5 &&
    typeof p.ready === 'boolean' &&
    typeof p.connected === 'boolean'
  );
}
export function validWorld(value: unknown): value is World {
  const w = value as World;
  const finite = (n: unknown, min = -1e6, max = 1e6) =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (
    !w ||
    w.version !== 1 ||
    typeof w.id !== 'string' ||
    w.id.length > 100 ||
    !['playing', 'won', 'lost'].includes(w.phase) ||
    !['normal', 'veteran', 'practice'].includes(w.difficulty)
  )
    return false;
  const m = w.monster;
  if (
    !m ||
    !MONSTERS.some((d) => d.id === m.id) ||
    !['stalk', 'windup', 'attack', 'recover', 'stagger', 'dead'].includes(m.mode) ||
    !MONSTERS.some((d) => d.moves.some((move) => move === m.move))
  )
    return false;
  if (
    ![
      'x',
      'z',
      'yaw',
      'hp',
      'maxHp',
      'timer',
      'duration',
      'targetX',
      'targetZ',
      'stagger',
      'head',
      'tail',
      'attackId',
      'sequence',
    ].every((k) => finite(m[k as keyof Beast])) ||
    m.maxHp <= 0 ||
    m.hp < 0 ||
    m.hp > m.maxHp
  )
    return false;
  if (
    !['enraged', 'headBroken', 'tailBroken'].every((k) => typeof m[k as keyof Beast] === 'boolean')
  )
    return false;
  if (
    !Array.isArray(w.players) ||
    w.players.length < 1 ||
    w.players.length > 4 ||
    new Set(w.players.map((p) => p?.id)).size !== w.players.length
  )
    return false;
  if (
    !w.players.every(
      (p) =>
        validMember(p) &&
        [
          'x',
          'z',
          'yaw',
          'hp',
          'maxHp',
          'stamina',
          'timer',
          'duration',
          'combo',
          'comboTimer',
          'invincible',
          'gauge',
          'charge',
          'buff',
          'damage',
          'sharpness',
          'ammo',
          'poison',
          'lastHit',
          'revive',
          'attackHits',
        ].every((k) => finite(p[k as keyof Player])) &&
        p.maxHp > 0 &&
        p.hp >= 0 &&
        p.hp <= p.maxHp &&
        p.stamina >= 0 &&
        p.stamina <= 100 &&
        [
          'idle',
          'attack',
          'special',
          'dodge',
          'hurt',
          'heal',
          'reload',
          'down',
          'sharpen',
        ].includes(p.action) &&
        !!p.items &&
        ITEMS.every((i) => finite(p.items[i], 0, 99)) &&
        ['hit', 'transformed', 'previousSpecial', 'bot'].every(
          (k) => typeof p[k as keyof Player] === 'boolean',
        ) &&
        (p.pendingItem === null || ITEMS.includes(p.pendingItem)),
    )
  )
    return false;
  if (
    !Array.isArray(w.effects) ||
    w.effects.length > 100 ||
    !w.effects.every(
      (e) =>
        e &&
        ['hit', 'heal', 'break', 'shot', 'blast', 'cart', 'buff'].includes(e.type) &&
        ['id', 'x', 'z', 'value', 'life'].every((k) => finite(e[k as keyof typeof e])) &&
        typeof e.owner === 'string',
    )
  )
    return false;
  if (
    !Array.isArray(w.hazards) ||
    w.hazards.length > 60 ||
    !w.hazards.every(
      (h) =>
        h &&
        ['fire', 'thunder', 'trap', 'bomb'].includes(h.type) &&
        ['id', 'x', 'z', 'radius', 'delay', 'life'].every((k) => finite(h[k as keyof typeof h])) &&
        typeof h.owner === 'string',
    )
  )
    return false;
  return (
    finite(w.elapsed, 0) &&
    finite(w.limit, 1) &&
    finite(w.carts, 0, 4) &&
    w.maxCarts === 3 &&
    finite(w.counter, 0) &&
    finite(w.noticeTime, 0, 30) &&
    typeof w.notice === 'string' &&
    w.notice.length <= 200
  );
}
function effect(
  w: World,
  type: World['effects'][number]['type'],
  x: number,
  z: number,
  value = 0,
  owner = '',
) {
  w.effects.push({ id: ++w.counter, type, x, z, value, life: 1, owner });
}
function notice(w: World, text: string) {
  w.notice = text;
  w.noticeTime = 3.5;
}
function bound(p: { x: number; z: number }) {
  const r = Math.hypot(p.x, p.z);
  if (r > ARENA_RADIUS) {
    p.x *= ARENA_RADIUS / r;
    p.z *= ARENA_RADIUS / r;
  }
}
function startAction(p: Player, action: Player['action'], time: number) {
  p.action = action;
  p.timer = time;
  p.duration = time;
  p.hit = false;
  p.attackHits = 0;
}
function hurt(w: World, p: Player, amount: number, input: Input, poison = false) {
  if (p.invincible > 0 || p.action === 'down' || !p.connected) return;
  const def = weapon(p.weapon);
  const facing = Math.cos(p.yaw - Math.atan2(w.monster.x - p.x, w.monster.z - p.z)) > 0.1;
  const counter = p.weapon === 'lance' && p.action === 'special';
  if ((input.guard && def.guard && facing) || counter) {
    const cost = amount * 0.7;
    if (p.stamina >= cost) {
      p.stamina -= cost;
      amount *= p.weapon === 'lance' ? 0.08 : 0.2;
      effect(w, 'hit', p.x, p.z, 0, p.id);
      if (counter) {
        damageMonster(w, p, def.power * 3.4, true);
        p.invincible = 0.7;
      }
    } else {
      p.stamina = 0;
      amount *= 0.8;
    }
  }
  if (w.difficulty === 'practice') amount = 0;
  p.hp = Math.max(0, p.hp - amount / (1 + p.armor * 0.08));
  p.invincible = 0.9;
  if (amount > 2) {
    startAction(p, 'hurt', 0.4);
    p.charge = 0;
    effect(w, 'hit', p.x, p.z, -Math.round(amount), p.id);
    if (poison) p.poison = 10;
  }
  if (p.hp <= 0) {
    startAction(p, 'down', 7);
    p.poison = 0;
    if (!p.bot) {
      w.carts++;
      notice(w, `力尽きた… 残り ${Math.max(0, w.maxCarts - w.carts)} 回`);
    }
    effect(w, 'cart', p.x, p.z, 0, p.id);
  }
}
function damageMonster(w: World, p: Player, amount: number, special = false) {
  const m = w.monster,
    def = weapon(p.weapon);
  if (m.hp <= 0) return;
  const d = distance(p, m);
  if (d > def.reach + (special ? 1.4 : 0)) return;
  const aim = Math.atan2(m.x - p.x, m.z - p.z);
  if (Math.cos(p.yaw - aim) < 0.25) return;
  const relative = Math.cos(Math.atan2(p.x - m.x, p.z - m.z) - m.yaw);
  const head = relative > 0.3,
    tail = relative < -0.5;
  const range = def.category === '射撃' ? (d > 7 && d < 20 ? 1.2 : 0.75) : 1;
  const sharp = def.category === '射撃' ? 1 : p.sharpness > 35 ? 1 : 0.7;
  const trueDamage = p.weapon === 'gunlance' && special;
  const damage = Math.round(
    amount *
      (p.bot ? 0.2 : 1) *
      (1 + p.level * 0.12) *
      (head ? 1.3 : tail ? 1.05 : 0.85) *
      (p.buff > 0 ? 1.2 : 1) *
      range *
      sharp *
      (trueDamage ? 1.3 : 1),
  );
  m.hp = Math.max(0, m.hp - damage);
  p.damage += damage;
  p.gauge = clamp(p.gauge + 8, 0, 100);
  p.sharpness = Math.max(0, p.sharpness - 0.7);
  effect(
    w,
    def.category === '射撃' ? 'shot' : 'hit',
    m.x + (p.x - m.x) * 0.3,
    m.z + (p.z - m.z) * 0.3,
    damage,
    p.id,
  );
  if (head) {
    m.head += damage;
    m.stagger += damage * (def.category === '打撃' ? 2.7 : 1);
  } else m.stagger += damage * 0.45;
  if (tail && def.category === '切断') m.tail += damage;
  if (!m.headBroken && m.head > m.maxHp * 0.19) {
    m.headBroken = true;
    notice(w, '頭部を破壊！');
    effect(w, 'break', m.x, m.z, 0, p.id);
  }
  if (!m.tailBroken && m.tail > m.maxHp * 0.16) {
    m.tailBroken = true;
    notice(w, '尻尾を切断！');
    effect(w, 'break', m.x, m.z, 0, p.id);
  }
  if (m.stagger > m.maxHp * 0.16) {
    m.stagger = 0;
    m.mode = 'stagger';
    m.timer = 3.3;
    m.duration = 3.3;
    notice(w, 'ダウン！ 攻撃のチャンス');
  }
  if (m.hp <= 0) {
    m.mode = 'dead';
    w.phase = 'won';
    notice(w, 'メインターゲットを達成しました');
  }
}
function useItem(w: World, p: Player, item: Item) {
  if (p.items[item] <= 0) return;
  if (item === 'potion' && p.hp >= p.maxHp) return;
  if (item === 'antidote' && p.poison <= 0) return;
  if (item === 'whetstone' && p.sharpness >= 99) return;
  p.items[item]--;
  if (item === 'potion') {
    startAction(p, 'heal', 1.3);
  } else if (item === 'antidote') {
    p.poison = 0;
    startAction(p, 'heal', 0.7);
    p.hit = true;
    effect(w, 'heal', p.x, p.z, 0, p.id);
  } else if (item === 'whetstone') {
    startAction(p, 'sharpen', 2.4);
  } else {
    w.hazards.push({
      id: ++w.counter,
      type: item,
      x: p.x + Math.sin(p.yaw) * 2,
      z: p.z + Math.cos(p.yaw) * 2,
      radius: item === 'trap' ? 3 : 4,
      delay: item === 'bomb' ? 2 : 0.5,
      life: item === 'bomb' ? 3 : 30,
      owner: p.id,
    });
    startAction(p, 'heal', 0.55);
    p.hit = true;
  }
}
function startSpecial(w: World, p: Player, power = 1) {
  const def = weapon(p.weapon);
  if (p.stamina < 18) return;
  if (['dualblades', 'switchaxe'].includes(p.weapon)) {
    p.transformed = !p.transformed;
    return;
  }
  if (p.weapon === 'huntinghorn') {
    if (p.gauge < 35) {
      notice(w, '攻撃を当てて演奏ゲージを溜めよう');
      return;
    }
    p.gauge -= 35;
    for (const ally of w.players)
      if (distance(p, ally) < 18 && ally.action !== 'down') {
        ally.hp = Math.min(ally.maxHp, ally.hp + 30);
        ally.buff = 25;
        effect(w, 'buff', ally.x, ally.z, 30, ally.id);
      }
    startAction(p, 'special', 1.2);
    p.hit = true;
    return;
  }
  if (['longsword', 'gunlance', 'chargeblade', 'lightbowgun', 'heavybowgun'].includes(p.weapon)) {
    if (p.gauge < 30) {
      notice(w, '通常攻撃で武器ゲージを溜めよう');
      return;
    }
    p.gauge -= 30;
  }
  p.stamina -= 18;
  p.charge = power;
  startAction(p, 'special', def.speed * 1.7);
  if (p.weapon === 'insectglaive') {
    p.invincible = 1.1;
    p.buff = 12;
  }
  if (p.weapon === 'longsword') p.invincible = 0.7;
}
function updatePlayer(w: World, p: Player, input: Input, dt: number) {
  if (!p.connected) return;
  if (input.item) p.pendingItem = input.item;
  p.invincible = Math.max(0, p.invincible - dt);
  p.buff = Math.max(0, p.buff - dt);
  p.comboTimer -= dt;
  if (p.comboTimer <= 0) p.combo = 0;
  p.stamina = clamp(p.stamina + dt * (input.guard ? 4 : p.transformed ? -8 : 20), 0, 100);
  if (p.stamina <= 0) p.transformed = false;
  if (p.transformed && p.weapon === 'switchaxe') {
    p.gauge = Math.max(0, p.gauge - dt * 12);
    if (p.gauge === 0) p.transformed = false;
  }
  if (p.poison > 0) {
    p.poison -= dt;
    p.hp = Math.max(1, p.hp - dt * 2);
  }
  const def = weapon(p.weapon),
    wasSpecial = p.previousSpecial;
  p.previousSpecial = input.special;
  if (p.action === 'down') {
    const allies = w.players.filter(
      (a) => a.id !== p.id && a.action !== 'down' && a.connected && distance(p, a) < 3,
    );
    p.timer -= dt * (allies.length ? 3 : 1);
    p.revive = 1 - p.timer / 7;
    if (p.timer <= 0) {
      p.hp = p.maxHp;
      p.x = (w.players.indexOf(p) - 1) * 2.5;
      p.z = 22;
      p.action = 'idle';
      p.invincible = 4;
      p.stamina = 100;
    }
    return;
  }
  if (p.action !== 'idle') {
    p.timer -= dt;
    if (p.action === 'dodge') {
      p.x += Math.sin(p.yaw) * 14 * dt;
      p.z += Math.cos(p.yaw) * 14 * dt;
      bound(p);
    }
    const isMulti =
      p.action === 'special' && ['swordshield', 'lightbowgun', 'insectglaive'].includes(p.weapon);
    const trigger = isMulti ? 0.75 - p.attackHits * 0.22 : 0.45;
    if (
      (p.action === 'attack' || p.action === 'special') &&
      (!p.hit || (isMulti && p.attackHits < 3)) &&
      p.timer < p.duration * trigger
    ) {
      p.hit = true;
      p.attackHits++;
      const mult =
        p.action === 'special'
          ? (p.weapon === 'chargeblade'
              ? 4
              : p.weapon === 'gunlance'
                ? 3.5
                : p.weapon === 'swordshield'
                  ? 2.6
                  : 2.2) *
            (1 + Math.max(0, p.charge - 1) * 0.8)
          : 1 + p.combo * 0.12;
      damageMonster(
        w,
        p,
        def.power * mult * (isMulti ? 0.48 : 1) * (p.transformed ? 1.5 : 1),
        p.action === 'special',
      );
      p.charge = 0;
    }
    if (p.action === 'heal' && !p.hit && p.timer <= 0.25) {
      p.hit = true;
      p.hp = Math.min(p.maxHp, p.hp + 65);
      effect(w, 'heal', p.x, p.z, 65, p.id);
    }
    if (p.timer <= 0) {
      if (p.action === 'sharpen') p.sharpness = 100;
      if (p.action === 'reload') p.ammo = p.weapon === 'heavybowgun' ? 5 : 8;
      p.action = 'idle';
    }
    if (input.dodge && p.action === 'attack' && p.timer < p.duration * 0.25 && p.stamina >= 22)
      p.action = 'idle';
    else return;
  }
  const charged = ['greatsword', 'hammer', 'bow'].includes(p.weapon);
  if (charged && input.special && p.stamina >= 18) {
    p.charge += dt;
    p.yaw = input.yaw;
    if (p.charge >= 1.5) startSpecial(w, p, 2.5);
    return;
  }
  if (charged && !input.special && wasSpecial && p.charge > 0) {
    startSpecial(w, p, 1 + p.charge);
    return;
  }
  if (p.pendingItem) {
    const item = p.pendingItem;
    p.pendingItem = null;
    useItem(w, p, item);
    return;
  }
  const moving = Math.hypot(input.x, input.z),
    speed =
      (def.category === '射撃' && p.weapon === 'heavybowgun' ? 4.1 : 6.5) *
      (p.transformed ? 1.25 : 1) *
      (input.guard ? 0.4 : 1);
  if (moving > 0.01) {
    p.x += (input.x / Math.max(1, moving)) * speed * dt;
    p.z += (input.z / Math.max(1, moving)) * speed * dt;
    bound(p);
  }
  p.yaw = input.yaw;
  if (input.dodge && p.stamina >= 22) {
    p.stamina -= 22;
    startAction(p, 'dodge', 0.42);
    p.invincible = 0.34;
    if (moving > 0.1) p.yaw = Math.atan2(input.x, input.z);
    return;
  }
  if (input.guard && def.guard) return;
  if (input.special && !wasSpecial && !charged) {
    startSpecial(w, p);
    return;
  }
  if (input.attack && p.stamina >= def.stamina) {
    if ((p.weapon === 'lightbowgun' || p.weapon === 'heavybowgun') && p.ammo <= 0) {
      startAction(p, 'reload', 1.8);
      return;
    }
    p.stamina -= def.stamina;
    p.ammo--;
    p.combo = (p.combo + 1) % 3;
    p.comboTimer = 1.8;
    startAction(p, 'attack', def.speed * (p.transformed ? 0.75 : 1));
  }
}
function botInput(w: World, p: Player): Input {
  const m = w.monster,
    d = distance(p, m),
    yaw = Math.atan2(m.x - p.x, m.z - p.z);
  const input = neutral();
  input.yaw = yaw;
  if (p.hp < 70 && p.items.potion > 0 && p.action === 'idle') input.item = 'potion';
  if (d > 3.8) {
    input.x = Math.sin(yaw) * 0.85;
    input.z = Math.cos(yaw) * 0.85;
  } else input.attack = true;
  if (m.mode === 'windup' && m.timer < 0.3 && d < 8) {
    input.dodge = true;
    input.x = -Math.sin(yaw);
    input.z = -Math.cos(yaw);
  }
  return input;
}
function updateMonster(w: World, inputs: Record<string, Input>, dt: number) {
  const m = w.monster,
    def = monster(m.id);
  if (m.mode === 'dead') return;
  const targets = w.players.filter((p) => p.connected && p.hp > 0 && p.action !== 'down');
  if (!targets.length) return;
  const humans = targets.filter((p) => !p.bot);
  const pool = m.sequence % 3 === 1 && humans.length ? humans : targets;
  const target = pool.reduce((a, b) => (distance(a, m) < distance(b, m) ? a : b));
  if (!m.enraged && m.hp < m.maxHp * 0.45) {
    m.enraged = true;
    notice(w, 'モンスターが怒り状態になった！');
  }
  m.timer -= dt;
  if (m.mode === 'stalk') {
    m.yaw = Math.atan2(target.x - m.x, target.z - m.z);
    if (distance(m, target) > 6) {
      const speed = (m.id === 'nargacuga' ? 5 : 3.3) * (m.enraged ? 1.25 : 1);
      m.x += Math.sin(m.yaw) * speed * dt;
      m.z += Math.cos(m.yaw) * speed * dt;
    }
    if (m.timer <= 0) {
      m.move = def.moves[m.sequence++ % def.moves.length];
      m.mode = 'windup';
      m.duration =
        (m.move === 'beam' ? 1.8 : m.move === 'charge' ? 1.35 : 1.05) * (m.enraged ? 0.8 : 1);
      m.timer = m.duration;
      m.targetX = target.x;
      m.targetZ = target.z;
      m.attackId++;
    }
  } else if (m.mode === 'windup') {
    if (m.timer > m.duration * 0.5) {
      m.targetX = target.x;
      m.targetZ = target.z;
      m.yaw = Math.atan2(target.x - m.x, target.z - m.z);
    }
    if (m.timer <= 0) {
      m.mode = 'attack';
      m.duration = m.move === 'charge' ? 0.95 : m.move === 'leap' ? 0.65 : 0.55;
      m.timer = m.duration;
      if (m.move === 'fire' || m.move === 'thunder') {
        const count = m.move === 'thunder' ? 3 : 1;
        for (let i = 0; i < count; i++)
          w.hazards.push({
            id: ++w.counter,
            type: m.move === 'fire' ? 'fire' : 'thunder',
            x: m.targetX + (i - 1) * (count > 1 ? 4 : 0),
            z: m.targetZ + (i % 2) * 3,
            radius: 3.8,
            delay: m.move === 'thunder' ? 0.65 : 0.3,
            life: m.move === 'fire' ? 5 : 1.5,
            owner: '',
          });
      }
    }
  } else if (m.mode === 'attack') {
    if (m.move === 'charge') {
      m.x += Math.sin(m.yaw) * 24 * dt;
      m.z += Math.cos(m.yaw) * 24 * dt;
      bound(m);
    }
    if (m.move === 'leap') {
      const blend = Math.min(1, dt / Math.max(dt, m.timer));
      m.x += (m.targetX - m.x) * blend;
      m.z += (m.targetZ - m.z) * blend;
      bound(m);
    }
    for (const p of targets) {
      if (p.lastHit === m.attackId) continue;
      const d = distance(p, m),
        dx = p.x - m.x,
        dz = p.z - m.z,
        front = dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw),
        side = Math.abs(dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw));
      const hit =
        m.move === 'beam'
          ? front > 0 && front < 30 && side < 3
          : m.move === 'tail'
            ? d < 8
            : m.move === 'roar'
              ? d < 10
              : m.move === 'charge'
                ? d < 4.4
                : m.move === 'leap'
                  ? d < 6 && m.timer < 0.22
                  : m.move === 'fire' || m.move === 'thunder'
                    ? false
                    : d < 6.5 && front > -1;
      if (hit) {
        p.lastHit = m.attackId;
        hurt(
          w,
          p,
          def.attack * (m.enraged ? 1.25 : 1) * (w.difficulty === 'veteran' ? 1.25 : 1),
          inputs[p.id] || neutral(),
          m.id === 'rathian' && m.move === 'tail',
        );
      }
    }
    if (m.timer <= 0) {
      m.mode = 'recover';
      m.timer = m.enraged ? 0.85 : 1.5;
      m.duration = m.timer;
    }
  } else if (m.timer <= 0) {
    m.mode = 'stalk';
    m.timer = m.enraged ? 0.5 : 1.2;
  }
}
export function stepWorld(w: World, inputs: Record<string, Input>, dt = STEP) {
  if (w.phase !== 'playing') return;
  dt = clamp(dt, 0, 0.1);
  w.elapsed += dt;
  w.noticeTime = Math.max(0, w.noticeTime - dt);
  w.effects = w.effects.filter((e) => (e.life -= dt) > 0).slice(-70);
  for (const p of w.players)
    updatePlayer(w, p, p.bot ? botInput(w, p) : inputs[p.id] || neutral(), dt);
  if (w.phase === 'playing') updateMonster(w, inputs, dt);
  for (const h of w.hazards) {
    h.delay -= dt;
    h.life -= dt;
    if (h.delay > 0) continue;
    if (h.type === 'trap' && distance(h, w.monster) < h.radius + 2) {
      w.monster.mode = 'stagger';
      w.monster.timer = 5;
      w.monster.duration = 5;
      h.life = 0;
      notice(w, 'シビレ罠が発動！');
    } else if (h.type === 'bomb') {
      const owner = w.players.find((p) => p.id === h.owner);
      if (owner && distance(h, w.monster) < 7) {
        const saved = { x: owner.x, z: owner.z, yaw: owner.yaw };
        owner.x = h.x;
        owner.z = h.z;
        owner.yaw = Math.atan2(w.monster.x - h.x, w.monster.z - h.z);
        damageMonster(w, owner, 160, true);
        Object.assign(owner, saved);
      }
      effect(w, 'blast', h.x, h.z, 0, h.owner);
      h.life = 0;
    } else if (h.type === 'fire' || h.type === 'thunder')
      for (const p of w.players)
        if (distance(h, p) < h.radius)
          hurt(w, p, h.type === 'fire' ? 13 : 24, inputs[p.id] || neutral());
  }
  w.hazards = w.hazards.filter((h) => h.life > 0);
  if (w.carts >= w.maxCarts || w.elapsed >= w.limit) {
    w.phase = 'lost';
    notice(
      w,
      w.carts >= w.maxCarts
        ? 'クエスト失敗 — 3回力尽きました'
        : 'クエスト失敗 — 制限時間を超えました',
    );
  }
}
export function abandon(w: World) {
  if (w.phase === 'playing') {
    w.phase = 'lost';
    w.notice = 'クエストから帰還しました';
  }
}
