import { neutral, type Input, type World } from './types';
import type { Item } from './data';
import type { HuntScene } from './scene';
export class Controls {
  keys = new Set<string>();
  touch = { x: 0, z: 0 };
  buttons = { attack: false, special: false, guard: false, dodge: false };
  item: Item | null = null;
  enabled = false;
  pulses = { attack: false, special: false, guard: false, dodge: false };
  setButton(key: keyof Controls['buttons'], pressed: boolean) {
    this.buttons[key] = pressed;
    if (pressed) this.pulses[key] = true;
  }
  private drag: { id: number; x: number; y: number } | null = null;
  constructor(
    private element: HTMLElement,
    private getScene: () => HuntScene | null,
    private onPause: () => void,
    private onLock: () => void,
  ) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.reset);
    element.addEventListener('pointerdown', this.pointerDown);
    element.addEventListener('pointermove', this.pointerMove);
    element.addEventListener('pointerup', this.pointerUp);
    element.addEventListener('pointercancel', this.pointerUp);
    element.addEventListener('contextmenu', this.context);
    element.addEventListener('wheel', this.wheel, { passive: false });
  }
  private down = (e: KeyboardEvent) => {
    if (!this.enabled || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
      e.preventDefault();
    if (e.code === 'Escape' && !e.repeat) {
      this.reset();
      this.onPause();
      return;
    }
    if (e.code === 'Tab' && !e.repeat) this.onLock();
    if (e.code === 'KeyQ' && !e.repeat) this.item = 'potion';
    if (e.code === 'Digit1') this.item = 'antidote';
    if (e.code === 'Digit2') this.item = 'trap';
    if (e.code === 'Digit3') this.item = 'bomb';
    if (e.code === 'KeyR') this.item = 'whetstone';
    this.keys.add(e.code);
    if (e.code === 'Space') this.pulses.dodge = true;
    if (e.code === 'KeyJ') this.pulses.attack = true;
    if (e.code === 'KeyK') this.pulses.special = true;
  };
  private up = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  reset = () => {
    this.keys.clear();
    this.touch = { x: 0, z: 0 };
    this.buttons = { attack: false, special: false, guard: false, dodge: false };
    this.item = null;
    this.drag = null;
    this.pulses = { attack: false, special: false, guard: false, dodge: false };
  };
  private pointerDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'touch' || e.button === 2) {
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.element.setPointerCapture(e.pointerId);
    } else if (e.button === 0) {
      this.setButton('attack', true);
      this.element.setPointerCapture(e.pointerId);
    }
  };
  private pointerMove = (e: PointerEvent) => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const s = this.getScene();
    if (s) {
      s.yaw -= (e.clientX - this.drag.x) * 0.006;
      s.pitch = Math.max(0.15, Math.min(1.1, s.pitch + (e.clientY - this.drag.y) * 0.004));
      if (s.locked && Math.abs(e.clientX - this.drag.x) > 3) this.onLock();
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private pointerUp = () => {
    this.buttons.attack = false;
    this.drag = null;
  };
  private context = (e: Event) => e.preventDefault();
  private wheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const s = this.getScene();
    if (s) s.distance = Math.max(8, Math.min(22, s.distance + e.deltaY * 0.01));
  };
  read(w: World | null, id: string): Input {
    if (!this.enabled || !w) return neutral();
    const s = this.getScene();
    const p = w.players.find((p) => p.id === id);
    if (!s || !p) return neutral();
    let x =
      this.touch.x +
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let z =
      this.touch.z +
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    const pad = navigator.getGamepads?.()[0];
    const b = (n: number) => !!pad?.buttons[n]?.pressed;
    if (pad) {
      if (Math.abs(pad.axes[0]) > 0.16) x += pad.axes[0];
      if (Math.abs(pad.axes[1]) > 0.16) z += pad.axes[1];
      if (Math.abs(pad.axes[2]) > 0.16) {
        s.yaw -= pad.axes[2] * 0.035;
        if (s.locked) this.onLock();
      }
    }
    const len = Math.max(1, Math.hypot(x, z));
    x /= len;
    z /= len;
    const wx = x * Math.cos(s.yaw) + z * Math.sin(s.yaw),
      wz = -x * Math.sin(s.yaw) + z * Math.cos(s.yaw);
    const aim = s.locked
      ? Math.atan2(w.monster.x - p.x, w.monster.z - p.z)
      : Math.hypot(x, z) > 0.1
        ? Math.atan2(wx, wz)
        : s.yaw + Math.PI;
    const input: Input = {
      x: wx,
      z: wz,
      yaw: aim % (Math.PI * 2),
      attack: this.buttons.attack || this.pulses.attack || this.keys.has('KeyJ') || b(2),
      special: this.buttons.special || this.pulses.special || this.keys.has('KeyK') || b(3),
      dodge: this.buttons.dodge || this.pulses.dodge || this.keys.has('Space') || b(0),
      guard:
        this.buttons.guard ||
        this.pulses.guard ||
        this.keys.has('ShiftLeft') ||
        this.keys.has('KeyL') ||
        b(4),
      item: this.item || (b(5) ? 'potion' : null),
    };
    return input;
  }
  consume() {
    this.item = null;
    this.pulses = { attack: false, special: false, guard: false, dodge: false };
  }
  dispose() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.reset);
    this.element.removeEventListener('pointerdown', this.pointerDown);
    this.element.removeEventListener('pointermove', this.pointerMove);
    this.element.removeEventListener('pointerup', this.pointerUp);
    this.element.removeEventListener('pointercancel', this.pointerUp);
    this.element.removeEventListener('contextmenu', this.context);
    this.element.removeEventListener('wheel', this.wheel);
  }
}
