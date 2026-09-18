import Peer, { util, type DataConnection, type PeerOptions } from 'peerjs';
import { createPlayer, validInput, validMember, validWorld } from '../game/engine';
import { MONSTERS } from '../game/data';
import { neutral, type HuntConfig, type Input, type Member, type World } from '../game/types';
import { read, remove, write } from './storage';
export interface NetSettings {
  turnUrl: string;
  username: string;
  credential: string;
  host: string;
  port: number;
  secure: boolean;
  path: string;
}
export const DEFAULT_NET: NetSettings = {
  turnUrl: '',
  username: '',
  credential: '',
  host: '',
  port: 443,
  secure: true,
  path: '/',
};
export interface Session {
  role: 'host' | 'guest';
  code: string;
  member: Member;
  config: HuntConfig;
}
export interface RoomView {
  role: 'host' | 'guest';
  code: string;
  members: Member[];
  status: 'connecting' | 'connected' | 'reconnecting' | 'error';
  message: string;
  latency: number;
  config: HuntConfig;
}
interface Callbacks {
  view: (v: RoomView) => void;
  world: (w: World | null) => void;
  input: (id: string, i: Input) => void;
}
type Packet = { v: 1; type: string; [key: string]: unknown };
const PREFIX = 'hunters-guild-v1-';
export const cleanCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, '')
    .slice(0, 8);
export const validCode = (s: string) => /^[A-HJ-NP-Z2-9]{8}$/.test(s);
export function newCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => a[b % a.length]).join('');
}
export function inviteLink(code: string) {
  const u = new URL(location.href);
  u.hash = `room=${code}`;
  u.search = '';
  return u.href;
}
export function loadSession() {
  const s = read<Session | null>('session', null, true);
  return s &&
    ['host', 'guest'].includes(s.role) &&
    validCode(s.code) &&
    validMember(s.member) &&
    validConfig(s.config)
    ? s
    : null;
}
function validConfig(value: unknown): value is HuntConfig {
  const c = value as HuntConfig;
  return (
    !!c &&
    MONSTERS.some((m) => m.id === c.monster) &&
    ['normal', 'veteran', 'practice'].includes(c.difficulty) &&
    typeof c.companion === 'boolean'
  );
}
export class Room {
  view: RoomView;
  world: World | null = null;
  private peer: Peer;
  private peers = new Map<string, DataConnection>();
  private identities = new Map<DataConnection, string>();
  private pending = new Set<DataConnection>();
  private guest: DataConnection | null = null;
  private closed = false;
  private rejected = false;
  private tick: ReturnType<typeof setInterval>;
  private latest = neutral();
  private lastHeard = Date.now();
  private started = Date.now();
  private lastConnect = 0;
  private lastPublish = 0;
  private lastSave = 0;
  private lastPing = 0;
  private count = 0;
  private inputTimes = new Map<string, number>();
  private sequences = new Map<string, number>();
  constructor(
    readonly session: Session,
    private callbacks: Callbacks,
    net: NetSettings = DEFAULT_NET,
  ) {
    this.view = {
      role: session.role,
      code: session.code,
      members: session.role === 'host' ? [session.member] : [],
      status: 'connecting',
      message: '集会所に接続しています…',
      latency: 0,
      config: { ...session.config, companion: false },
    };
    if (session.role === 'host') {
      const saved = read<{ members: Member[]; world: World | null } | null>(
        `room:${session.code}`,
        null,
        true,
      );
      if (saved && saved.members.every(validMember)) {
        this.view.members = saved.members.map((m) => ({
          ...m,
          connected: m.id === session.member.id,
          ready: m.id === session.member.id,
        }));
        if (validWorld(saved.world)) {
          this.world = saved.world;
          this.world.players.forEach((p) => {
            p.connected = p.id === session.member.id;
          });
          callbacks.world(this.world);
        }
      }
    }
    write('session', session, true);
    const iceServers: RTCIceServer[] = [
      ...util.defaultConfig.iceServers,
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    if (/^turns?:\S+$/.test(net.turnUrl))
      iceServers.push({ urls: net.turnUrl, username: net.username, credential: net.credential });
    const options: PeerOptions = { debug: 0, pingInterval: 5000, config: { iceServers } };
    if (net.host)
      Object.assign(options, {
        host: net.host,
        port: net.port,
        secure: net.secure,
        path: net.path,
      });
    this.peer =
      session.role === 'host' ? new Peer(PREFIX + session.code, options) : new Peer(options);
    this.peer.on('open', () => {
      if (this.closed) return;
      if (session.role === 'host') {
        this.view.status = 'connected';
        this.view.message = '招待コードを仲間に共有してください';
        this.emit();
      } else this.connect();
    });
    this.peer.on('connection', (c) => {
      if (session.role === 'host') this.accept(c);
      else c.close();
    });
    this.peer.on('error', (error) => {
      if (this.closed) return;
      const type = error.type;
      this.view.message =
        type === 'unavailable-id'
          ? 'このコードは使用中です。新しい集会所を作成してください。'
          : type === 'peer-unavailable'
            ? '集会所が見つかりません。コードとホストの接続を確認してください。'
            : `接続できませんでした (${type})。接続設定や回線を確認してください。`;
      this.view.status = 'error';
      this.emit();
    });
    this.peer.on('disconnected', () => {
      if (!this.closed) {
        this.view.status = 'reconnecting';
        this.view.message = '接続サービスに再接続中…';
        this.emit();
        if (!this.peer.destroyed) this.peer.reconnect();
      }
    });
    this.tick = setInterval(() => this.update(), 50);
    this.emit();
  }
  private emit() {
    this.callbacks.view({ ...this.view, members: this.view.members.map((m) => ({ ...m })) });
  }
  private send(c: DataConnection | null, type: string, data: Record<string, unknown> = {}) {
    if (c?.open)
      try {
        c.send({ v: 1, type, ...data });
      } catch {
        /* The close handler handles disconnected channels. */
      }
  }
  private broadcast(type: string, data: Record<string, unknown> = {}) {
    this.peers.forEach((c) => this.send(c, type, data));
  }
  private connect() {
    if (this.closed || this.rejected || this.peer.disconnected || !this.peer.id) return;
    this.lastConnect = Date.now();
    this.guest?.close();
    const c = this.peer.connect(PREFIX + this.session.code, {
      reliable: true,
      serialization: 'json',
    });
    this.guest = c;
    c.on('open', () => {
      this.lastHeard = Date.now();
      this.send(c, 'hello', { member: this.session.member });
    });
    c.on('data', (data) => {
      if (c === this.guest) this.receive(c, data);
    });
    c.on('close', () => {
      if (c !== this.guest || this.closed || this.rejected) return;
      this.view.status = 'reconnecting';
      this.view.message = 'ホストとの接続が切れました。再接続中…';
      this.emit();
    });
    c.on('error', () => {});
  }
  private accept(c: DataConnection) {
    if (this.peers.size + this.pending.size >= 10) {
      c.close();
      return;
    }
    this.pending.add(c);
    const timeout = setTimeout(() => {
      if (this.pending.has(c)) {
        this.pending.delete(c);
        c.close();
      }
    }, 8000);
    c.on('data', (data) => this.receive(c, data));
    c.on('close', () => {
      clearTimeout(timeout);
      this.pending.delete(c);
      const id = this.identities.get(c);
      if (!id || this.peers.get(id) !== c) return;
      this.peers.delete(id);
      const m = this.view.members.find((m) => m.id === id);
      if (m) {
        m.connected = false;
        m.ready = false;
      }
      if (this.world?.phase !== 'playing')
        this.view.members = this.view.members.filter((member) => member.id !== id);
      this.inputTimes.delete(id);
      this.sequences.delete(id);
      this.identities.delete(c);
      const p = this.world?.players.find((p) => p.id === id);
      if (p) p.connected = false;
      this.callbacks.input(id, neutral());
      this.publishLobby();
    });
    c.on('error', () => {});
  }
  private receive(c: DataConnection, data: unknown) {
    const p = data as Packet;
    if (!p || p.v !== 1 || typeof p.type !== 'string') return;
    if (this.session.role === 'host') {
      if (p.type === 'hello' && validMember(p.member) && this.pending.has(c)) {
        const incoming = { ...p.member, ready: false, connected: true };
        let member = this.view.members.find((m) => m.id === incoming.id);
        if (incoming.id === this.session.member.id) {
          this.reject(c, 'プレイヤーIDが重複しています');
          return;
        }
        if (!member && (this.view.members.length >= 4 || this.world?.phase === 'playing')) {
          this.reject(
            c,
            this.view.members.length >= 4
              ? 'この集会所は満員です'
              : '狩猟中です。帰還後に参加してください',
          );
          return;
        }
        if (member) {
          this.peers.get(member.id)?.close();
          member.connected = true;
          member.ready = false;
        } else {
          member = incoming;
          this.view.members.push(member);
        }
        this.pending.delete(c);
        this.identities.set(c, member.id);
        this.peers.set(member.id, c);
        this.sequences.delete(member.id);
        const hunter = this.world?.players.find((p) => p.id === member!.id);
        if (hunter) hunter.connected = true;
        this.send(c, 'welcome', {
          members: this.view.members,
          config: this.view.config,
          world: this.world,
        });
        this.publishLobby();
        return;
      }
      const id = this.identities.get(c);
      if (!id || this.peers.get(id) !== c) return;
      this.inputTimes.set(id, Date.now());
      if (
        p.type === 'input' &&
        validInput(p.input) &&
        Number.isInteger(p.seq) &&
        Number(p.seq) > (this.sequences.get(id) || -1)
      ) {
        this.sequences.set(id, Number(p.seq));
        this.callbacks.input(id, p.input);
      } else if (p.type === 'ready') {
        const m = this.view.members.find((m) => m.id === id);
        if (m) m.ready = p.ready === true;
        this.publishLobby();
      } else if (p.type === 'ping') this.send(c, 'pong', { time: p.time });
    } else {
      this.lastHeard = Date.now();
      if (p.type === 'reject') {
        this.rejected = true;
        this.view.status = 'error';
        this.view.message = String(p.message).slice(0, 200);
        this.emit();
        return;
      }
      if (
        (p.type === 'welcome' || p.type === 'lobby') &&
        Array.isArray(p.members) &&
        p.members.length <= 4 &&
        p.members.every(validMember) &&
        validConfig(p.config)
      ) {
        this.view.members = p.members;
        this.view.config = p.config;
        this.view.status = 'connected';
        this.view.message = '仲間が揃ったら準備完了にしてください';
        this.emit();
        if (validWorld(p.world)) {
          this.world = p.world;
          this.callbacks.world(p.world);
        }
      }
      if (p.type === 'world' && validWorld(p.world)) {
        this.world = p.world;
        this.view.status = 'connected';
        this.callbacks.world(p.world);
      }
      if (p.type === 'return') {
        this.world = null;
        this.callbacks.world(null);
      }
      if (p.type === 'pong' && typeof p.time === 'number') {
        this.view.latency = Math.max(0, Date.now() - p.time);
        this.emit();
      }
    }
  }
  private reject(c: DataConnection, message: string) {
    this.send(c, 'reject', { message });
    setTimeout(() => c.close(), 500);
    this.pending.delete(c);
  }
  private publishLobby() {
    this.broadcast('lobby', { members: this.view.members, config: this.view.config });
    this.emit();
  }
  setConfig(config: HuntConfig) {
    if (this.session.role !== 'host' || this.world?.phase === 'playing' || !validConfig(config))
      return;
    this.view.config = { ...config, companion: false };
    this.session.config = this.view.config;
    write('session', this.session, true);
    this.view.members.forEach((m) => {
      m.ready = m.id === this.session.member.id;
    });
    this.publishLobby();
  }
  setReady(ready: boolean) {
    if (this.session.role === 'guest') this.send(this.guest, 'ready', { ready });
  }
  setInput(input: Input) {
    this.latest = {
      ...input,
      attack: input.attack || this.latest.attack,
      special: input.special || this.latest.special,
      dodge: input.dodge || this.latest.dodge,
      item: input.item || this.latest.item,
    };
  }
  start(w: World) {
    if (this.session.role !== 'host') return;
    this.world = w;
    this.broadcast('world', { world: w });
  }
  returnToCamp() {
    if (this.session.role !== 'host') return;
    this.world = null;
    this.view.members = this.view.members.filter((member) => member.connected);
    this.view.members.forEach((m) => {
      m.ready = m.id === this.session.member.id;
    });
    this.broadcast('return');
    this.publishLobby();
  }
  canStart() {
    return (
      this.session.role === 'host' &&
      this.view.status === 'connected' &&
      this.view.members.filter((m) => m.connected).every((m) => m.ready)
    );
  }
  private update() {
    if (this.closed) return;
    const now = Date.now();
    if (this.session.role === 'host') {
      if (now - this.lastPublish > 90 && this.world) {
        this.lastPublish = now;
        this.broadcast('world', { world: this.world });
      }
      for (const [id, time] of this.inputTimes)
        if (now - time > 500) this.callbacks.input(id, neutral());
      if (now - this.lastSave > 2000) {
        this.lastSave = now;
        write(`room:${this.session.code}`, { members: this.view.members, world: this.world }, true);
      }
    } else {
      if (this.guest?.open) {
        this.send(this.guest, 'input', { input: this.latest, seq: ++this.count });
        this.latest = { ...this.latest, attack: false, special: false, dodge: false, item: null };
        if (now - this.lastPing > 1500) {
          this.lastPing = now;
          this.send(this.guest, 'ping', { time: now });
        }
      }
      if (
        (!this.guest?.open || now - this.lastHeard > 6000) &&
        now - this.lastConnect > 4000 &&
        !this.rejected
      )
        this.connect();
      if (now - this.lastHeard > 8000 && this.view.status === 'connected') {
        this.view.status = 'reconnecting';
        this.view.message = '通信が途切れました。ホストに再接続中…';
        this.emit();
      }
    }
    if (now - this.started > 25000 && this.view.status === 'connecting') {
      this.view.status = 'error';
      this.view.message = '接続がタイムアウトしました。接続設定や回線を確認してください。';
      this.emit();
    }
  }
  close(forget = true) {
    this.closed = true;
    clearInterval(this.tick);
    this.peers.forEach((c) => c.close());
    this.pending.forEach((c) => c.close());
    this.guest?.close();
    this.peer.destroy();
    if (forget) {
      remove('session', true);
      remove(`room:${this.session.code}`, true);
    }
  }
}
