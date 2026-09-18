import { useRef, useState, type PointerEvent } from 'react';
import { Crosshair, FlaskConical, Shield, Swords, Wind, Zap } from 'lucide-react';
import type { Controls } from '../game/input';
import { weapon } from '../game/data';
import type { Player } from '../game/types';
export function TouchControls({
  controls,
  player,
  lock,
  onLock,
}: {
  controls: Controls | null;
  player: Player;
  lock: boolean;
  onLock: () => void;
}) {
  const origin = useRef({ x: 0, y: 0 }),
    pointer = useRef<number | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const move = (e: PointerEvent) => {
    if (pointer.current !== e.pointerId) return;
    const x = e.clientX - origin.current.x,
      y = e.clientY - origin.current.y,
      r = Math.max(1, Math.hypot(x, y) / 43);
    setStick({ x: x / r, y: y / r });
    if (controls) controls.touch = { x: x / r / 43, z: y / r / 43 };
  };
  const release = () => {
    pointer.current = null;
    setStick({ x: 0, y: 0 });
    if (controls) controls.touch = { x: 0, z: 0 };
  };
  const hold = (
    key: 'attack' | 'special' | 'dodge' | 'guard',
    name: string,
    Icon: typeof Swords,
    extra = '',
  ) => (
    <button
      className={`action-button ${extra}`}
      aria-label={name}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (controls) controls.setButton(key, true);
      }}
      onPointerUp={() => {
        if (controls) controls.setButton(key, false);
      }}
      onPointerCancel={() => {
        if (controls) controls.setButton(key, false);
      }}
      onLostPointerCapture={() => {
        if (controls) controls.setButton(key, false);
      }}
    >
      <Icon size={25} />
      <span>{name}</span>
    </button>
  );
  return (
    <div className="touch-controls">
      <div
        className="move-stick"
        role="group"
        aria-label="移動スティック"
        onPointerDown={(e) => {
          e.preventDefault();
          pointer.current = e.pointerId;
          const r = e.currentTarget.getBoundingClientRect();
          origin.current = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <div className="stick-guide" />
        <span className="stick-knob" style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}>
          <Wind size={24} />
        </span>
        <span className="stick-label">MOVE</span>
      </div>
      <div className="touch-utilities">
        <button
          aria-label="回復薬を使う"
          onClick={() => {
            if (controls) controls.item = 'potion';
          }}
        >
          <FlaskConical size={22} />
          <span>{player.items.potion}</span>
        </button>
        <button aria-label="ターゲットロック" aria-pressed={lock} onClick={onLock}>
          <Crosshair size={22} />
        </button>
      </div>
      <div className="action-pad">
        {hold('special', weapon(player.weapon).special, Zap, 'special-button')}
        {hold('attack', '攻撃', Swords, 'attack-button')}
        {hold('dodge', '回避', Wind, 'dodge-button')}
        {weapon(player.weapon).guard && hold('guard', 'ガード', Shield, 'guard-button')}
      </div>
    </div>
  );
}
