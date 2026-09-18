import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, type Session } from '../src/lib/network';
import { neutral } from '../src/game/types';

class Channel extends EventEmitter {
  open = true;
  sent: Record<string, unknown>[] = [];
  send(packet: Record<string, unknown>) {
    this.sent.push(structuredClone(packet));
  }
  close() {
    this.open = false;
    this.emit('close');
  }
}
const captured = vi.hoisted(() => ({ peers: [] as (EventEmitter & { channel: Channel })[] }));
vi.mock('peerjs', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    util: { defaultConfig: { iceServers: [] } },
    default: class extends EventEmitter {
      id = 'test-peer';
      disconnected = false;
      destroyed = false;
      channel = new Channel();
      constructor() {
        super();
        captured.peers.push(this);
      }
      connect() {
        return this.channel;
      }
      destroy() {
        this.destroyed = true;
      }
    },
  };
});
const session = (role: Session['role']): Session => ({
  role,
  code: 'ABCDEFGH',
  member: {
    id: role,
    name: role,
    weapon: 'greatsword',
    level: 0,
    armor: 0,
    connected: true,
    ready: true,
  },
  config: { monster: 'rathalos', difficulty: 'practice', companion: false },
});
const rooms: Room[] = [];
const openRoom = (role: Session['role']) => {
  const input = vi.fn();
  const room = new Room(session(role), { view: vi.fn(), world: vi.fn(), input });
  rooms.push(room);
  const peer = captured.peers.at(-1)!;
  peer.emit('open');
  peer.channel.emit('open');
  return { room, peer, input };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  rooms.splice(0).forEach((room) => room.close(false));
  captured.peers.length = 0;
  vi.useRealTimers();
});

describe('network input lifecycle', () => {
  it('keeps a charged action held between slower render frames', () => {
    const { room, peer } = openRoom('guest');
    room.setInput({ ...neutral(), special: true });
    vi.advanceTimersByTime(200);
    const packets = peer.channel.sent.filter((p) => p.type === 'input');
    expect(packets).toHaveLength(4);
    expect(packets.every((p) => (p.input as ReturnType<typeof neutral>).special)).toBe(true);
    room.setInput(neutral());
    vi.advanceTimersByTime(100);
    expect(peer.channel.sent.filter((p) => p.type === 'input').at(-1)?.input).toMatchObject({
      special: false,
    });
  });

  it('sends a quick tap once even if released before the network interval', () => {
    const { room, peer } = openRoom('guest');
    room.setInput({ ...neutral(), attack: true });
    room.setInput(neutral());
    vi.advanceTimersByTime(100);
    const packets = peer.channel.sent.filter((p) => p.type === 'input');
    expect(packets.map((p) => (p.input as ReturnType<typeof neutral>).attack)).toEqual([
      true,
      false,
    ]);
  });

  it('preserves received movement across a local rendering stall, then expires stale input', () => {
    const { peer, input } = openRoom('host');
    const channel = new Channel();
    peer.emit('connection', channel);
    channel.emit('data', { v: 1, type: 'hello', member: session('guest').member });
    const movement = { ...neutral(), x: 1 };
    channel.emit('data', { v: 1, type: 'input', input: movement, seq: 1 });
    expect(input).toHaveBeenLastCalledWith('guest', movement);
    vi.setSystemTime(Date.now() + 900);
    vi.advanceTimersByTime(50);
    expect(input).toHaveBeenLastCalledWith('guest', movement);
    vi.advanceTimersByTime(600);
    expect(input).toHaveBeenLastCalledWith('guest', neutral());
  });

  it('clears movement immediately when a channel closes', () => {
    const { peer, input } = openRoom('host');
    const channel = new Channel();
    peer.emit('connection', channel);
    channel.emit('data', { v: 1, type: 'hello', member: session('guest').member });
    channel.emit('data', { v: 1, type: 'input', input: { ...neutral(), z: 1 }, seq: 1 });
    channel.close();
    expect(input).toHaveBeenLastCalledWith('guest', neutral());
  });
});
