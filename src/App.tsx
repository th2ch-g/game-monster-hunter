import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Copy,
  Crosshair,
  Flame,
  FlaskConical,
  Hammer,
  Heart,
  Leaf,
  Maximize,
  Menu,
  Mountain,
  Radio,
  Settings2,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  MONSTERS,
  WEAPONS,
  ITEMS,
  ITEM_NAMES,
  MOVE_NAMES,
  monster,
  weapon,
  type Difficulty,
  type MonsterId,
} from './game/data';
import { abandon, createWorld, stepWorld } from './game/engine';
import { neutral, type HuntConfig, type Input, type Member, type World } from './game/types';
import { HuntScene } from './game/scene';
import { Controls } from './game/input';
import { Sound } from './lib/audio';
import {
  claimReward,
  DEFAULT_SETTINGS,
  downloadProfile,
  loadProfile,
  loadSettings,
  upgrade,
  upgradeCost,
  write,
  type Profile,
} from './lib/storage';
import {
  cleanCode,
  DEFAULT_NET,
  inviteLink,
  loadSession,
  newCode,
  Room,
  validCode,
  type NetSettings,
  type RoomView,
  type Session,
} from './lib/network';
import { MonsterPortrait } from './components/MonsterPortrait';
import { Modal } from './components/Modal';
import { TouchControls } from './components/TouchControls';
const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
type Panel = 'weapons' | 'forge' | 'settings' | 'help' | 'online' | 'codex' | null;
const initialInvite = () =>
  cleanCode(new URLSearchParams(location.hash.slice(1)).get('room') || '');
export default function App() {
  const [profile, setProfile] = useState(loadProfile),
    [settings, setSettings] = useState(loadSettings),
    [selected, setSelected] = useState<MonsterId>('rathalos'),
    [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [panel, setPanel] = useState<Panel>(initialInvite() ? 'online' : null),
    [world, setWorld] = useState<World | null>(null),
    [paused, setPaused] = useState(false),
    [sceneError, setSceneError] = useState(''),
    [toast, setToast] = useState(''),
    [locked, setLocked] = useState(true),
    [ready, setReady] = useState(false),
    [fps, setFps] = useState(60);
  const [roomView, setRoomView] = useState<RoomView | null>(null),
    [code, setCode] = useState(initialInvite),
    [network, setNetwork] = useState<NetSettings>(DEFAULT_NET),
    [savedSession, setSavedSession] = useState(loadSession),
    [showNet, setShowNet] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    scene = useRef<HuntScene | null>(null),
    controls = useRef<Controls | null>(null),
    audio = useRef<Sound | null>(null),
    worldRef = useRef<World | null>(null),
    room = useRef<Room | null>(null),
    playerId = useRef('solo'),
    inputs = useRef<Record<string, Input>>({}),
    selectedRef = useRef(selected),
    pausedRef = useRef(false),
    effectCursor = useRef(0),
    profileRef = useRef(profile),
    settingsRef = useRef(settings);
  selectedRef.current = selected;
  pausedRef.current = paused;
  profileRef.current = profile;
  settingsRef.current = settings;
  const notify = useCallback((s: string) => {
    setToast(s);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const saveProfile = (p: Profile) => {
    setProfile(p);
    if (!write('profile', p))
      notify('保存できません。設定からセーブデータをダウンロードできます。');
  };
  useEffect(() => {
    write('settings', settings);
    scene.current?.updateSettings(settings);
    if (audio.current) audio.current.settings = settings;
  }, [settings]);
  const toggleLock = useCallback(() => {
    const s = scene.current;
    if (s) {
      s.locked = !s.locked;
      setLocked(s.locked);
    }
  }, []);
  const pauseGame = useCallback(() => {
    setPaused((p) => !p);
  }, []);
  useEffect(() => {
    if (!container.current) return;
    audio.current = new Sound(settingsRef.current);
    try {
      scene.current = new HuntScene(container.current, settingsRef.current, setSceneError);
      controls.current = new Controls(
        container.current,
        () => scene.current,
        pauseGame,
        toggleLock,
      );
      setReady(true);
    } catch (e) {
      setSceneError(
        `3Dを開始できませんでした。WebGL 2対応のブラウザをお使いください。${e instanceof Error ? ' ' + e.message : ''}`,
      );
    }
    let frame = 0,
      lastUI = 0,
      lastTime = 0,
      accumulated = 0;
    const animate = (time: number) => {
      const s = scene.current,
        w = worldRef.current,
        c = controls.current,
        online = room.current;
      if (c)
        c.enabled =
          !!w &&
          w.phase === 'playing' &&
          !pausedRef.current &&
          (online?.view.status === 'connected' || !online);
      const input = c?.read(w, playerId.current) || neutral();
      inputs.current[playerId.current] = input;
      if (online?.session.role === 'guest') {
        online.setInput(input);
        c?.consume();
      }
      accumulated += Math.min((time - lastTime) / 1000, 0.5) || 0;
      lastTime = time;
      if (
        w &&
        w.phase === 'playing' &&
        online?.session.role !== 'guest' &&
        (!pausedRef.current || online)
      ) {
        while (accumulated >= 1 / 30) {
          stepWorld(w, inputs.current);
          for (const value of Object.values(inputs.current)) value.item = null;
          c?.consume();
          inputs.current[playerId.current] = { ...input, item: null };
          accumulated -= 1 / 30;
          if (online) online.world = w;
        }
      } else accumulated = 0;
      if (w)
        for (const e of w.effects)
          if (e.id > effectCursor.current) {
            audio.current?.play(e.type);
            effectCursor.current = e.id;
          }
      if (s && w) s.render(w, playerId.current, selectedRef.current, time);
      if (time - lastUI > 100) {
        lastUI = time;
        if (w)
          setWorld({ ...w, players: w.players.map((p) => ({ ...p })), monster: { ...w.monster } });
        if (s) setFps(s.fps);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const visibility = () => {
      if (document.hidden) {
        controls.current?.reset();
        room.current?.setInput(neutral());
        if (worldRef.current && !room.current) setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    Object.defineProperty(window, '__HUNT_STATE__', {
      configurable: true,
      value: () => ({
        world: worldRef.current ? structuredClone(worldRef.current) : null,
        playerId: playerId.current,
        fps: scene.current?.fps,
        room: room.current ? structuredClone(room.current.view) : null,
        controls: {
          enabled: controls.current?.enabled || false,
          keys: [...(controls.current?.keys || [])],
          inputs: structuredClone(inputs.current),
        },
      }),
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      controls.current?.dispose();
      scene.current?.dispose();
      audio.current?.dispose();
      room.current?.close(false);
    };
  }, [pauseGame, toggleLock]);
  useEffect(() => {
    if (!world || world.phase === 'playing') return;
    const p = claimReward(profileRef.current, world);
    if (p !== profileRef.current) {
      saveProfile(p);
      audio.current?.play(world.phase);
    }
    controls.current?.reset();
  }, [world?.id, world?.phase]);
  const member = (): Member => ({
    id: crypto.randomUUID(),
    name: profile.name.trim() || 'HUNTER',
    weapon: profile.weapon,
    level: profile.ranks[profile.weapon] || 0,
    armor: profile.armor,
    ready: true,
    connected: true,
  });
  const config = (): HuntConfig => ({
    monster: selected,
    difficulty,
    companion: settings.companion,
  });
  const receiveWorld = (w: World | null) => {
    const changedHunt = w?.id !== worldRef.current?.id;
    worldRef.current = w;
    setWorld(w);
    if (w && changedHunt) {
      setPanel(null);
      setPaused(false);
      pausedRef.current = false;
      controls.current?.reset();
      if (controls.current) controls.current.enabled = w.phase === 'playing';
    } else if (!w) setPanel('online');
  };
  const beginSolo = () => {
    audio.current?.unlock();
    playerId.current = 'solo';
    const m = { ...member(), id: 'solo' };
    const w = createWorld(config(), [m]);
    worldRef.current = w;
    setWorld(w);
    setPaused(false);
    setPanel(null);
    effectCursor.current = 0;
    controls.current?.reset();
    if (controls.current) controls.current.enabled = true;
    if (scene.current) {
      scene.current.locked = true;
      setLocked(true);
    }
  };
  const beginRoom = (role: 'host' | 'guest', restored?: Session) => {
    audio.current?.unlock();
    if (role === 'guest' && !restored && !validCode(code)) {
      notify('8文字の招待コードを入力してください');
      return;
    }
    room.current?.close(false);
    const s = restored || {
      role,
      code: role === 'host' ? newCode() : code,
      member: member(),
      config: { ...config(), companion: false },
    };
    playerId.current = s.member.id;
    inputs.current = {};
    effectCursor.current = 0;
    try {
      room.current = new Room(
        s,
        {
          view: setRoomView,
          world: receiveWorld,
          input: (id, input) => {
            inputs.current[id] = input;
          },
        },
        network,
      );
      setSavedSession(s);
      setPanel(room.current.world ? null : 'online');
    } catch {
      notify('通信を開始できません。WebRTC対応ブラウザをお使いください。');
    }
  };
  const beginCoop = () => {
    if (!room.current?.canStart()) return;
    const w = createWorld(
      room.current.view.config,
      room.current.view.members.filter((m) => m.connected),
    );
    room.current.start(w);
    receiveWorld(w);
    effectCursor.current = 0;
  };
  const leaveRoom = () => {
    room.current?.close();
    room.current = null;
    setRoomView(null);
    setSavedSession(null);
    worldRef.current = null;
    setWorld(null);
    setPaused(false);
    setPanel(null);
    controls.current?.reset();
    history.replaceState(null, '', location.pathname + location.search);
  };
  const returnCamp = () => {
    if (room.current) {
      if (room.current.session.role === 'host') {
        room.current.returnToCamp();
        worldRef.current = null;
        setWorld(null);
        setPanel('online');
      } else leaveRoom();
    } else {
      worldRef.current = null;
      setWorld(null);
    }
    setPaused(false);
    controls.current?.reset();
  };
  const retire = () => {
    if (room.current?.session.role === 'guest') {
      leaveRoom();
      return;
    }
    if (worldRef.current) {
      abandon(worldRef.current);
      setWorld({ ...worldRef.current });
    }
    setPaused(false);
  };
  const fullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      void document.documentElement
        .requestFullscreen()
        .catch(() => notify('このブラウザでは全画面表示を利用できません'));
    else notify('ブラウザの共有メニューからホーム画面に追加できます');
  };
  const copyInvite = async () => {
    if (!roomView) return;
    try {
      await navigator.clipboard.writeText(inviteLink(roomView.code));
      notify('招待リンクをコピーしました');
    } catch {
      notify('招待コードを選択してコピーしてください');
    }
  };
  const buy = (kind: Profile['weapon'] | 'armor') => {
    const material =
      MONSTERS.find(
        (m) =>
          (profile.materials[m.id] || 0) >=
          (kind === 'armor' ? profile.armor : profile.ranks[kind] || 0),
      )?.id || selected;
    const p = upgrade(profile, kind, material);
    if (p) {
      saveProfile(p);
      audio.current?.play('heal');
      notify('装備を強化しました');
    } else notify('強化に必要なゼニーまたは素材が足りません');
  };
  const target = monster(selected),
    p = world?.players.find((p) => p.id === playerId.current),
    boss = world ? monster(world.monster.id) : target,
    activeWeapon = weapon(profile.weapon),
    isGuest = roomView?.role === 'guest';
  return (
    <div className={`app ${world ? 'in-hunt' : ''}`}>
      <div
        className={`scene-container ${world ? 'playing' : 'preview-scene'}`}
        ref={container}
        aria-hidden={!world}
      />
      {sceneError && (
        <div role="alert" className="scene-error">
          <h2>3D描画を利用できません</h2>
          <p>{sceneError}</p>
          <button
            className="primary"
            onClick={() => {
              write('settings', { ...settings, quality: 'low' });
              location.reload();
            }}
          >
            低画質で再読み込み
          </button>
        </div>
      )}
      {!world ? (
        <>
          <header className="site-header">
            <a className="brand" href="./" aria-label="HUNTER'S GUILD ホーム">
              <span className="crest">
                <Swords size={27} />
              </span>
              <span>
                HUNTER'S <b>GUILD</b>
                <small>MONSTER HUNTER FAN GAME</small>
              </span>
            </a>
            <nav aria-label="メインメニュー">
              <button className={!panel ? 'active' : ''} onClick={() => setPanel(null)}>
                <Compass size={17} />
                <span>クエスト</span>
              </button>
              <button onClick={() => setPanel('forge')}>
                <Hammer size={17} />
                <span>加工屋</span>
              </button>
              <button onClick={() => setPanel('codex')}>
                <BookOpen size={17} />
                <span>図鑑</span>
              </button>
            </nav>
            <div className="header-actions">
              <span className="rank-badge">
                HR <strong>{1 + Math.floor(profile.victories / 2)}</strong>
              </span>
              <button className="icon-button" aria-label="遊び方" onClick={() => setPanel('help')}>
                <CircleHelp size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="設定"
                onClick={() => setPanel('settings')}
              >
                <Settings2 size={20} />
              </button>
            </div>
          </header>
          <main className="guild-main">
            <section className="hero">
              <div className="hero-art" />
              <div className="hero-shade" />
              <div className="hero-content">
                <span className="eyebrow">
                  <span className="live-dot" /> THE HUNT BRINGS US TOGETHER
                </span>
                <h1>
                  ひと狩り、
                  <br />
                  仲間とともに。
                </h1>
                <p>
                  武器を手に、未知の一歩を。
                  <br />
                  空の王者が待つ狩場へ、いま出発しよう。
                </p>
                <button
                  className="hero-cta"
                  onClick={() => {
                    setPanel('online');
                    audio.current?.unlock();
                  }}
                >
                  <Users size={18} />
                  集会所を開く
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="hero-caption">
                <span>FIELD NOTES — 01</span>
                <strong>古代樹の森</strong>
                <small>ANCIENT FOREST / RATHALOS</small>
              </div>
              <div className="hero-bottom">
                <span>
                  <span className="live-dot" /> ソロ・最大4人オンライン協力
                </span>
                <span>
                  14 WEAPONS <i /> 6 MONSTERS
                </span>
              </div>
            </section>
            <div className="board-heading">
              <div>
                <span className="eyebrow">THE QUEST BOARD</span>
                <h2>次の狩りを、選ぼう。</h2>
              </div>
              <span className="section-note">
                大型モンスター討伐 <b>06</b>
              </span>
            </div>
            <div className="quest-layout">
              <section className="quest-grid" aria-label="クエスト一覧">
                {MONSTERS.map((m, i) => (
                  <button
                    key={m.id}
                    className={`quest-card ${selected === m.id ? 'selected' : ''} biome-${m.biome}`}
                    aria-pressed={selected === m.id}
                    onClick={() => setSelected(m.id)}
                  >
                    <div className="card-meta">
                      <span>QUEST {String(i + 1).padStart(2, '0')}</span>
                      <span className="stars" aria-label={`難度 ${m.stars}`}>
                        {'★'.repeat(m.stars)}
                      </span>
                    </div>
                    <div className="monster-stage">
                      <div className="monster-seal" />
                      <MonsterPortrait id={m.id} />
                      <span className="monster-watermark">{m.en}</span>
                    </div>
                    <div className="card-footer">
                      <div>
                        <span>{m.title}</span>
                        <h3>{m.name}</h3>
                      </div>
                      <span className="select-mark">
                        {selected === m.id ? <Check size={17} /> : <ArrowRight size={16} />}
                      </span>
                    </div>
                    <div className="card-location">
                      <Mountain size={12} />
                      {m.habitat}
                      {profile.records[m.id] && (
                        <span>
                          <Check size={12} /> 討伐済
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </section>
              <aside className="quest-details">
                <div className="detail-label">
                  <span className="eyebrow">QUEST BRIEFING</span>
                  <span className="paper-pin" />
                </div>
                <h2>{target.title}</h2>
                <p className="target-name">{target.name}の討伐</p>
                <p className="quest-description">{target.description}</p>
                <dl className="quest-spec">
                  <div>
                    <dt>
                      <Compass size={14} />
                      目的地
                    </dt>
                    <dd>{target.habitat}</dd>
                  </div>
                  <div>
                    <dt>
                      <Timer size={14} />
                      制限時間
                    </dt>
                    <dd>{difficulty === 'practice' ? 60 : 15} 分</dd>
                  </div>
                  <div>
                    <dt>
                      <Sparkles size={14} />
                      報酬金
                    </dt>
                    <dd className="gold">
                      {(difficulty === 'practice'
                        ? 0
                        : Math.round(target.reward * (difficulty === 'veteran' ? 1.5 : 1))
                      ).toLocaleString()}{' '}
                      z
                    </dd>
                  </div>
                </dl>
                <label className="select-label">
                  クエスト難度
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  >
                    <option value="normal">通常 / STANDARD</option>
                    <option value="veteran">上位 / VETERAN</option>
                    <option value="practice">練習 / ダメージなし・報酬なし</option>
                  </select>
                </label>
                <div className="loadout-label">
                  <span>現在の装備</span>
                  <button onClick={() => setPanel('weapons')}>
                    変更 <ChevronRight size={14} />
                  </button>
                </div>
                <button className="loadout" onClick={() => setPanel('weapons')}>
                  <span className="weapon-symbol">
                    <Swords size={25} />
                  </span>
                  <span>
                    <strong>{activeWeapon.name}</strong>
                    <small>
                      {activeWeapon.en} · Lv.{(profile.ranks[profile.weapon] || 0) + 1}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <button
                  className="primary embark"
                  disabled={!ready || !!sceneError || !!roomView}
                  onClick={beginSolo}
                >
                  <Swords size={18} />
                  {roomView ? '集会所に参加中' : 'ソロで出発'}
                  <ArrowRight size={19} />
                </button>
                <button className="secondary" onClick={() => setPanel('online')}>
                  <Users size={17} />
                  仲間と狩る
                </button>
                <p className="detail-footnote">
                  <Shield size={12} /> 回復薬・罠・爆弾を支給済み
                </p>
              </aside>
            </div>
            <section className="camp-strip">
              <div className="camp-icon">
                <Flame size={24} />
              </div>
              <div>
                <h3>狩りの準備も、冒険のうち。</h3>
                <p>素材で装備を強化して、次の強敵に挑もう。</p>
              </div>
              <button onClick={() => setPanel('forge')}>
                加工屋へ <ArrowRight size={17} />
              </button>
              <div className="camp-stat">
                <strong>{profile.victories}</strong>
                <span>討伐記録</span>
              </div>
              <div className="camp-stat">
                <strong>
                  {profile.zenny.toLocaleString()} <small>z</small>
                </strong>
                <span>所持金</span>
              </div>
            </section>
          </main>
          <footer className="site-footer">
            <span>
              <Swords size={14} /> HUNTER'S GUILD
            </span>
            <p>
              非公式ファンゲーム · 自作3Dモデルによるアレンジ版
              <br className="mobile-break" />
              「モンスターハンター」関連の名称・キャラクターはCAPCOMに帰属します。
            </p>
            <button onClick={() => setPanel('help')}>
              操作ガイド <ArrowRight size={13} />
            </button>
          </footer>
        </>
      ) : (
        p && (
          <>
            <div className="hunt-vignette" />
            <header className="hunt-top">
              <div className="hunter-status">
                <div className="hunter-avatar">
                  <Shield size={25} />
                </div>
                <div className="hunter-vitals">
                  <div className="hunter-title">
                    <strong>{p.name}</strong>
                    <span>{weapon(p.weapon).name}</span>
                  </div>
                  <div
                    className="bar hp"
                    role="meter"
                    aria-label="体力"
                    aria-valuenow={Math.round(p.hp)}
                    aria-valuemin={0}
                    aria-valuemax={p.maxHp}
                  >
                    <span style={{ width: `${(p.hp / p.maxHp) * 100}%` }} />
                    <small>
                      {Math.ceil(p.hp)} / {p.maxHp}
                    </small>
                  </div>
                  <div
                    className="bar stamina"
                    role="meter"
                    aria-label="スタミナ"
                    aria-valuenow={Math.round(p.stamina)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${p.stamina}%` }} />
                  </div>
                  <div className="weapon-gauge">
                    <span style={{ width: `${p.gauge}%` }} />
                  </div>
                  <div className="status-tags">
                    {p.transformed && <span>強化モード</span>}
                    {p.buff > 0 && <span>攻撃力 UP</span>}
                    {p.poison > 0 && <span className="poison">毒 / 解毒薬 1</span>}
                    {p.sharpness < 35 && <span>斬れ味低下 / 砥石 R</span>}
                    {p.action === 'reload' && <span>リロード中</span>}
                    {p.charge > 0 && (
                      <span>溜め Lv.{Math.min(3, 1 + Math.floor(p.charge * 1.5))}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="hunt-clock">
                <span>
                  <Timer size={16} />
                  {formatTime(world.limit - world.elapsed)}
                </span>
                <span>
                  <Skull size={14} />
                  {world.carts} / {world.maxCarts}
                </span>
              </div>
              <div className="hunt-tools">
                <button
                  className="icon-button"
                  aria-label="音の切り替え"
                  onClick={() => setSettings({ ...settings, sound: !settings.sound })}
                >
                  {settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                <button
                  className="icon-button fullscreen"
                  aria-label="全画面表示"
                  onClick={fullScreen}
                >
                  <Maximize size={20} />
                </button>
                <button
                  className="icon-button"
                  aria-label="狩猟メニュー"
                  onClick={() => {
                    setPaused(true);
                    controls.current?.reset();
                  }}
                >
                  <Menu size={22} />
                </button>
              </div>
            </header>
            <div className="monster-hud">
              <div>
                <span className="eyebrow">MAIN TARGET</span>
                <span>{world.monster.enraged && <b className="enraged">怒り状態</b>}</span>
              </div>
              <h2>
                {boss.name}
                <span>{boss.title}</span>
              </h2>
              <div
                className="bar monster-health"
                role="meter"
                aria-label="モンスターの体力"
                aria-valuenow={Math.round(world.monster.hp)}
                aria-valuemin={0}
                aria-valuemax={world.monster.maxHp}
              >
                <span style={{ width: `${(world.monster.hp / world.monster.maxHp) * 100}%` }} />
              </div>
              <div className="parts">
                <span className={world.monster.headBroken ? 'broken' : ''}>
                  頭部 {world.monster.headBroken ? '破壊済' : '未破壊'}
                </span>
                <span className={world.monster.tailBroken ? 'broken' : ''}>
                  尻尾 {world.monster.tailBroken ? '切断済' : '未切断'}
                </span>
              </div>
            </div>
            <div className="party-list">
              {world.players
                .filter((a) => a.id !== p.id)
                .map((a) => (
                  <div key={a.id}>
                    <span className={`party-dot ${a.connected ? '' : 'offline'}`} />
                    <div>
                      <strong>{a.name}</strong>
                      <div className="bar hp">
                        <span style={{ width: `${(a.hp / a.maxHp) * 100}%` }} />
                      </div>
                    </div>
                    <span>
                      {!a.connected
                        ? '切断中'
                        : a.action === 'down'
                          ? '救援'
                          : a.bot
                            ? 'オトモ'
                            : weapon(a.weapon).name}
                    </span>
                  </div>
                ))}
            </div>
            <div className="minimap" aria-label="狩場マップ">
              <span className="map-north">N</span>
              <span className="map-ring" />
              <i
                className="map-monster"
                style={{
                  left: `${50 + (world.monster.x / 85) * 100}%`,
                  top: `${50 + (world.monster.z / 85) * 100}%`,
                }}
              />
              <i
                className="map-player"
                style={{
                  left: `${50 + (p.x / 85) * 100}%`,
                  top: `${50 + (p.z / 85) * 100}%`,
                  transform: `rotate(${-p.yaw}rad)`,
                }}
              />
              {world.players
                .filter((a) => a.id !== p.id)
                .map((a) => (
                  <i
                    className="map-ally"
                    key={a.id}
                    style={{ left: `${50 + (a.x / 85) * 100}%`, top: `${50 + (a.z / 85) * 100}%` }}
                  />
                ))}
            </div>
            {world.noticeTime > 0 && (
              <div className="hunt-notice" role="status">
                {world.notice}
              </div>
            )}
            {world.monster.mode === 'windup' && (
              <div className="attack-warning">
                <Target size={17} />
                {MOVE_NAMES[world.monster.move]}に備えよ
              </div>
            )}
            {roomView && roomView.status !== 'connected' && (
              <div className="connection-warning" role="alert">
                <Wifi size={18} />
                {roomView.message}
              </div>
            )}
            {p.action === 'down' && (
              <div className="down-notice">
                <Heart size={25} />
                <h2>キャンプへ搬送中</h2>
                <p>仲間が近くにいると復帰が早まります</p>
                <strong>{Math.ceil(p.timer)} 秒</strong>
              </div>
            )}
            <div className="desktop-controls">
              <div className="key-guide">
                <span>
                  <kbd>W A S D</kbd> 移動
                </span>
                <span>
                  <kbd>J</kbd> 攻撃
                </span>
                <span>
                  <kbd>K</kbd> {weapon(p.weapon).special}
                </span>
                <span>
                  <kbd>SPACE</kbd> 回避
                </span>
                {weapon(p.weapon).guard && (
                  <span>
                    <kbd>L</kbd> ガード
                  </span>
                )}
                <span>
                  <kbd>TAB</kbd> ロック
                </span>
                <span>右ドラッグで視点</span>
              </div>
              <div className="item-belt">
                {ITEMS.map((item, i) => (
                  <button
                    key={item}
                    disabled={p.items[item] <= 0}
                    aria-label={`${ITEM_NAMES[item]}を使用`}
                    onClick={() => {
                      if (controls.current) controls.current.item = item;
                    }}
                  >
                    <span className="item-key">{['Q', '1', '2', '3', 'R'][i]}</span>
                    {item === 'potion' ? (
                      <FlaskConical size={21} />
                    ) : item === 'trap' ? (
                      <Zap size={21} />
                    ) : item === 'bomb' ? (
                      <Flame size={21} />
                    ) : item === 'antidote' ? (
                      <Leaf size={21} />
                    ) : (
                      <Sparkles size={21} />
                    )}
                    <span>
                      {ITEM_NAMES[item]} <b>×{p.items[item]}</b>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <TouchControls
              controls={controls.current}
              player={p}
              lock={locked}
              onLock={toggleLock}
            />
            <div className="field-footer">
              <span>
                {boss.habitat} <i />{' '}
                {world.difficulty === 'practice'
                  ? '練習クエスト'
                  : world.difficulty === 'veteran'
                    ? '上位クエスト'
                    : '討伐クエスト'}
              </span>
              <span>
                {roomView ? `${roomView.latency} ms · ONLINE` : 'SOLO'} <i /> {fps} FPS
              </span>
            </div>
            {paused && world.phase === 'playing' && (
              <Modal title="狩猟メニュー" onClose={() => setPaused(false)}>
                <p className="muted">
                  {roomView
                    ? 'オンライン狩猟はメニュー表示中も進行します。'
                    : '狩猟を一時停止しています。'}
                </p>
                <button className="primary full" onClick={() => setPaused(false)}>
                  狩りに戻る <ArrowRight size={18} />
                </button>
                <div className="pause-items">
                  {ITEMS.map((item) => (
                    <button
                      className="secondary"
                      key={item}
                      disabled={p.items[item] <= 0}
                      onClick={() => {
                        if (controls.current) controls.current.item = item;
                        setPaused(false);
                      }}
                    >
                      {ITEM_NAMES[item]} ×{p.items[item]}
                    </button>
                  ))}
                </div>
                <label className="select-label">
                  描画品質
                  <select
                    value={settings.quality}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        quality: e.target.value as typeof settings.quality,
                      })
                    }
                  >
                    <option value="auto">自動</option>
                    <option value="low">軽量</option>
                    <option value="high">高画質</option>
                  </select>
                </label>
                <button className="danger full" onClick={retire}>
                  {isGuest ? '集会所から退出' : 'クエストをリタイア'}
                </button>
                <p className="muted small">
                  通常攻撃でゲージを蓄積。特殊技は K /
                  右上ボタン。大剣・ハンマー・弓は長押しで溜めます。
                </p>
              </Modal>
            )}
            {world.phase !== 'playing' && (
              <div className="result-backdrop">
                <section
                  className="result-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="result-title"
                >
                  <div className={`result-crest ${world.phase === 'lost' ? 'failed' : ''}`}>
                    {world.phase === 'won' ? <Trophy size={44} /> : <Swords size={44} />}
                  </div>
                  <span className="eyebrow">
                    {world.phase === 'won' ? 'QUEST COMPLETE' : 'QUEST ENDED'}
                  </span>
                  <h1 id="result-title">
                    {world.phase === 'won' ? '狩猟、達成。' : 'また、次の狩りへ。'}
                  </h1>
                  <p>
                    {boss.name} {world.phase === 'won' ? 'の討伐に成功しました' : world.notice}
                  </p>
                  <div className="result-stats">
                    <div>
                      <span>狩猟時間</span>
                      <strong>{formatTime(world.elapsed)}</strong>
                    </div>
                    <div>
                      <span>与えたダメージ</span>
                      <strong>{p.damage.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>報酬金</span>
                      <strong>
                        {world.phase === 'won' && world.difficulty !== 'practice'
                          ? Math.round(
                              boss.reward * (world.difficulty === 'veteran' ? 1.5 : 1),
                            ).toLocaleString()
                          : 0}{' '}
                        z
                      </strong>
                    </div>
                  </div>
                  {world.phase === 'won' && world.difficulty !== 'practice' && (
                    <div className="rewards">
                      <Sparkles size={19} />
                      {boss.material} ×
                      {3 + Number(world.monster.headBroken) + Number(world.monster.tailBroken)}
                      <span>自動保存済み</span>
                    </div>
                  )}
                  <div className="result-party">
                    {world.players
                      .filter((a) => !a.bot)
                      .map((a) => (
                        <div key={a.id}>
                          <span>{a.name}</span>
                          <span>{weapon(a.weapon).name}</span>
                          <strong>{a.damage.toLocaleString()} dmg</strong>
                        </div>
                      ))}
                  </div>
                  <button autoFocus className="primary full" onClick={returnCamp}>
                    {isGuest ? '集会所から退出' : 'キャンプへ帰還'}
                    <ArrowRight size={18} />
                  </button>
                  {isGuest && (
                    <p className="small muted">
                      ホストが帰還すると、同じ集会所で次の狩りを準備できます。
                    </p>
                  )}
                </section>
              </div>
            )}
          </>
        )
      )}
      {panel === 'weapons' && (
        <Modal title="武器を選ぶ" wide onClose={() => setPanel(null)}>
          <p className="muted">14の武器、14の狩り方。使い慣れた一本を見つけよう。</p>
          <div className="weapon-grid">
            {WEAPONS.map((w) => (
              <button
                key={w.id}
                className={`weapon-card ${profile.weapon === w.id ? 'chosen' : ''}`}
                onClick={() => saveProfile({ ...profile, weapon: w.id })}
                aria-pressed={profile.weapon === w.id}
              >
                <div>
                  <Swords size={22} style={{ color: w.color }} />
                  <span>
                    {w.category}
                    {w.guard ? ' / ガード可' : ''}
                  </span>
                  {profile.weapon === w.id && <Check size={17} />}
                </div>
                <h3>{w.name}</h3>
                <small>{w.en}</small>
                <p>{w.detail}</p>
                <div className="weapon-card-bottom">
                  <span>
                    <Zap size={12} />
                    {w.special}
                  </span>
                  <span>Lv.{(profile.ranks[w.id] || 0) + 1}</span>
                </div>
              </button>
            ))}
          </div>
          <button className="primary full sticky-confirm" onClick={() => setPanel(null)}>
            {weapon(profile.weapon).name}を装備する
            <Check size={18} />
          </button>
        </Modal>
      )}
      {panel === 'forge' && (
        <Modal title="加工屋" onClose={() => setPanel(null)}>
          <div className="forge-wallet">
            <Hammer size={27} />
            <div>
              <strong>素材を、一歩先の力へ。</strong>
              <p>討伐素材で武器と防具を強化できます。</p>
            </div>
            <b>{profile.zenny.toLocaleString()} z</b>
          </div>
          <div className="forge-item">
            <div>
              <span className="eyebrow">EQUIPPED WEAPON</span>
              <h3>
                {activeWeapon.name} <small>Lv.{(profile.ranks[profile.weapon] || 0) + 1}</small>
              </h3>
              <p>
                攻撃力 +{(profile.ranks[profile.weapon] || 0) * 12}% → +
                {((profile.ranks[profile.weapon] || 0) + 1) * 12}%
              </p>
              <small>必要素材：任意の討伐素材 ×{profile.ranks[profile.weapon] || 0}</small>
            </div>
            <button
              className="primary"
              disabled={(profile.ranks[profile.weapon] || 0) >= 5}
              onClick={() => buy(profile.weapon)}
            >
              {(profile.ranks[profile.weapon] || 0) >= 5
                ? '最大強化'
                : `${upgradeCost(profile.ranks[profile.weapon] || 0)} z で強化`}
            </button>
          </div>
          <div className="forge-item">
            <div>
              <span className="eyebrow">HUNTER ARMOR</span>
              <h3>
                ハンターアーマー <small>Lv.{profile.armor + 1}</small>
              </h3>
              <p>
                最大体力 {120 + profile.armor * 15} → {135 + profile.armor * 15}
              </p>
              <small>必要素材：任意の討伐素材 ×{profile.armor}</small>
            </div>
            <button className="primary" disabled={profile.armor >= 5} onClick={() => buy('armor')}>
              {profile.armor >= 5 ? '最大強化' : `${upgradeCost(profile.armor)} z で強化`}
            </button>
          </div>
          <h3 className="subheading">素材ポーチ</h3>
          <div className="material-list">
            {MONSTERS.map((m) => (
              <div key={m.id}>
                <span>{m.material}</span>
                <b>× {profile.materials[m.id] || 0}</b>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {panel === 'codex' && (
        <Modal title="ハンターノート" wide onClose={() => setPanel(null)}>
          <div className="codex-grid">
            {MONSTERS.map((m) => (
              <article key={m.id} className={`codex-card biome-${m.biome}`}>
                <MonsterPortrait id={m.id} />
                <span className="eyebrow">
                  {m.en} / {m.species}
                </span>
                <h3>
                  {m.name}
                  <small>{m.title}</small>
                </h3>
                <p>{m.description}</p>
                <div>
                  <span>狙い目</span>
                  <b>{m.weakness.split(' / ')[0]}</b>
                </div>
                <div>
                  <span>攻撃</span>
                  <b>
                    {m.moves
                      .map((x) => MOVE_NAMES[x])
                      .filter((x, i, a) => a.indexOf(x) === i)
                      .join('・')}
                  </b>
                </div>
                <div>
                  <span>自己ベスト</span>
                  <b>{profile.records[m.id] ? formatTime(profile.records[m.id]) : '未討伐'}</b>
                </div>
              </article>
            ))}
          </div>
        </Modal>
      )}
      {panel === 'settings' && (
        <Modal title="設定" onClose={() => setPanel(null)}>
          <label className="select-label">
            ハンター名
            <input
              maxLength={16}
              value={profile.name}
              onChange={(e) => saveProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <Volume2 size={18} />
              効果音
            </span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => {
                audio.current?.unlock();
                setSettings({ ...settings, sound: e.target.checked });
              }}
            />
          </label>
          <label className="select-label">
            音量
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => setSettings({ ...settings, volume: Number(e.target.value) })}
            />
          </label>
          <label className="select-label">
            描画品質
            <select
              value={settings.quality}
              onChange={(e) =>
                setSettings({ ...settings, quality: e.target.value as typeof settings.quality })
              }
            >
              <option value="auto">自動 — 端末に合わせて調整</option>
              <option value="high">高画質 — 影と高解像度</option>
              <option value="low">軽量 — スマホ・省電力向け</option>
            </select>
          </label>
          <label className="toggle-row">
            <span>被弾時のカメラ振動</span>
            <input
              type="checkbox"
              checked={settings.shake}
              onChange={(e) => setSettings({ ...settings, shake: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>ソロにオトモを同行</span>
            <input
              type="checkbox"
              checked={settings.companion}
              onChange={(e) => setSettings({ ...settings, companion: e.target.checked })}
            />
          </label>
          <button className="secondary full" onClick={() => downloadProfile(profile)}>
            <ArrowDownToLine size={17} />
            セーブデータをダウンロード
          </button>
          <p className="muted small">
            装備・素材・討伐記録はこのブラウザに保存されます。プライベートモードでは保存が消えることがあります。
          </p>
        </Modal>
      )}
      {panel === 'help' && (
        <Modal title="狩りの手引き" wide onClose={() => setPanel(null)}>
          <div className="guide-intro">
            <Compass size={33} />
            <div>
              <h3>観察して、かわして、反撃する。</h3>
              <p>攻撃の赤い予兆を避け、隙を突いて大型モンスターを討伐しましょう。</p>
            </div>
          </div>
          <div className="guide-grid">
            <section>
              <h3>キーボード・マウス</h3>
              <dl className="help-keys">
                <div>
                  <dt>W A S D / 矢印</dt>
                  <dd>移動</dd>
                </div>
                <div>
                  <dt>J / 左クリック</dt>
                  <dd>通常攻撃・連撃</dd>
                </div>
                <div>
                  <dt>K</dt>
                  <dd>武器固有アクション</dd>
                </div>
                <div>
                  <dt>Space</dt>
                  <dd>回避（短時間無敵）</dd>
                </div>
                <div>
                  <dt>L / Shift</dt>
                  <dd>対応武器でガード</dd>
                </div>
                <div>
                  <dt>Q / 1 / 2 / 3 / R</dt>
                  <dd>回復 / 解毒 / 罠 / 爆弾 / 砥石</dd>
                </div>
                <div>
                  <dt>Tab / 右ドラッグ</dt>
                  <dd>ロック / 視点回転</dd>
                </div>
                <div>
                  <dt>ホイール / Esc</dt>
                  <dd>カメラ距離 / メニュー</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3>スマートフォン</h3>
              <p>
                左スティックで移動、右ボタンで攻撃・特殊技・回避。背景をドラッグして視点を動かせます。縦持ち・横持ちに対応しています。
              </p>
              <p>瓶ボタンで回復。その他のアイテムは右上のメニューから使えます。</p>
              <h3>ゲームパッド</h3>
              <p>
                左スティックで移動、Xで攻撃、Yで特殊技、Aで回避、LBでガード、RBで回復。右スティックで視点を回転。
              </p>
            </section>
            <section>
              <h3>狩猟のコツ</h3>
              <p>
                大剣・ハンマー・弓の特殊技は長押しで溜めます。他の武器は通常攻撃でゲージを溜め、特殊技で解放します。
              </p>
              <p>
                頭を狙うと大ダメージとダウン。尻尾の切断や頭部破壊で追加素材を獲得できます。回復中は無防備です。罠や回避で隙を作りましょう。
              </p>
            </section>
            <section>
              <h3>仲間との協力</h3>
              <p>
                集会所を作成し、8文字の招待コードかリンクを共有。全員が準備完了になったらホストが出発できます。
              </p>
              <p>
                最大4人。切断時は自動再接続し、再読み込み後も集会所に復帰できます。3回の力尽きは全員で共有。倒れた仲間の近くに寄ると復帰が早まります。
              </p>
            </section>
          </div>
          <p className="guide-note">
            このゲームは非公式のブラウザ向けアレンジです。自作モデル・独自の戦闘数値を使用しています。
          </p>
        </Modal>
      )}
      {panel === 'online' && (
        <Modal title="オンライン集会所" onClose={() => setPanel(null)}>
          {!roomView ? (
            <>
              <div className="online-intro">
                <Users size={34} />
                <h3>同じ狩場へ、最大4人で。</h3>
                <p>招待リンクを送るだけ。仲間と一緒に大物を狩ろう。</p>
              </div>
              <label className="select-label">
                ハンター名
                <input
                  maxLength={16}
                  value={profile.name}
                  onChange={(e) => saveProfile({ ...profile, name: e.target.value })}
                />
              </label>
              <div className="online-loadout">
                <span>
                  {target.name} /{' '}
                  {difficulty === 'veteran' ? '上位' : difficulty === 'practice' ? '練習' : '通常'}
                </span>
                <span>
                  {activeWeapon.name} Lv.{(profile.ranks[profile.weapon] || 0) + 1}
                </span>
              </div>
              <button className="primary full" onClick={() => beginRoom('host')}>
                <Users size={18} />
                集会所を作成
              </button>
              <div className="divider">
                <span>招待を受け取ったら</span>
              </div>
              <label className="select-label">
                招待コード
                <input
                  className="code-input"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="8文字のコード"
                  value={code}
                  onChange={(e) => setCode(cleanCode(e.target.value))}
                />
              </label>
              <button
                className="secondary full"
                disabled={!validCode(code)}
                onClick={() => beginRoom('guest')}
              >
                参加する <ArrowRight size={17} />
              </button>
              {savedSession && (
                <button
                  className="text-button full"
                  onClick={() => beginRoom(savedSession.role, savedSession)}
                >
                  前の集会所に復帰する ({savedSession.code})
                </button>
              )}
            </>
          ) : (
            <>
              <div className="room-code-panel">
                <span className="eyebrow">INVITATION CODE</span>
                <strong data-testid="room-code">{roomView.code}</strong>
                <button className="secondary" onClick={copyInvite}>
                  <Copy size={16} />
                  招待リンクをコピー
                </button>
              </div>
              <p
                className={`network-status ${roomView.status === 'error' ? 'error' : ''}`}
                role="status"
              >
                <Radio size={15} />
                {roomView.message}
              </p>
              <div className="room-members">
                {Array.from({ length: 4 }, (_, i) => {
                  const m = roomView.members[i];
                  return (
                    <div key={i} className={m ? 'member occupied' : 'member'}>
                      <span className="member-number">0{i + 1}</span>
                      {m ? (
                        <>
                          <div>
                            <strong>
                              {m.name}
                              {i === 0 && <small>HOST</small>}
                            </strong>
                            <span>
                              {weapon(m.weapon).name} · Lv.{m.level + 1}
                            </span>
                          </div>
                          <span className={`ready-badge ${m.ready ? 'is-ready' : ''}`}>
                            {!m.connected ? '切断中' : m.ready ? '準備完了' : '準備中'}
                          </span>
                        </>
                      ) : (
                        <span>仲間を待っています…</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {roomView.role === 'host' && (
                <label className="select-label">
                  次のクエスト
                  <select
                    value={roomView.config.monster}
                    onChange={(e) =>
                      room.current?.setConfig({
                        ...roomView.config,
                        monster: e.target.value as MonsterId,
                      })
                    }
                  >
                    {MONSTERS.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="online-loadout">
                <span>{monster(roomView.config.monster).name}</span>
                <span>
                  {roomView.config.difficulty === 'veteran'
                    ? '上位'
                    : roomView.config.difficulty === 'practice'
                      ? '練習'
                      : '通常'}
                  クエスト
                </span>
              </div>
              {roomView.role === 'host' ? (
                <button
                  className="primary full"
                  disabled={!room.current?.canStart()}
                  onClick={beginCoop}
                >
                  全員で出発 <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  className="primary full"
                  disabled={roomView.status !== 'connected'}
                  onClick={() =>
                    room.current?.setReady(
                      !roomView.members.find((m) => m.id === playerId.current)?.ready,
                    )
                  }
                >
                  {roomView.members.find((m) => m.id === playerId.current)?.ready
                    ? '準備を解除'
                    : '準備完了'}
                  <Check size={18} />
                </button>
              )}
              <button className="text-button full" onClick={leaveRoom}>
                集会所から退出
              </button>
            </>
          )}
          {!roomView && (
            <>
              <button
                className="network-toggle"
                aria-expanded={showNet}
                onClick={() => setShowNet(!showNet)}
              >
                <Settings2 size={14} />
                接続設定
              </button>
              {showNet && (
                <div className="network-settings">
                  <p className="muted small">
                    直接接続できない回線では、ご自身のTURNサーバーを指定できます。認証情報は保存されません。
                  </p>
                  <label className="select-label">
                    TURN URL
                    <input
                      value={network.turnUrl}
                      placeholder="turn:relay.example.org:3478"
                      onChange={(e) => setNetwork({ ...network, turnUrl: e.target.value })}
                    />
                  </label>
                  <label className="select-label">
                    TURN ユーザー名
                    <input
                      value={network.username}
                      onChange={(e) => setNetwork({ ...network, username: e.target.value })}
                    />
                  </label>
                  <label className="select-label">
                    TURN パスワード
                    <input
                      type="password"
                      value={network.credential}
                      onChange={(e) => setNetwork({ ...network, credential: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </>
          )}
          <p className="small muted connection-note">
            <Wifi size={13} />
            ホストはプレイ中、画面を開いたままにしてください。接続にはインターネットとWebRTCが必要です。
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
