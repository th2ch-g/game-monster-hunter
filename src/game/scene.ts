import * as T from 'three';
import { makeHunter, makeMonster, material, disposeGroup, type Rig } from './models';
import { monster, type Biome, type MonsterId } from './data';
import type { World } from './types';
import type { Settings } from '../lib/storage';
const palettes: Record<
  Biome,
  { sky: number; fog: number; ground: number; leaf: number; sun: number }
> = {
  forest: { sky: 0x87b3b3, fog: 0xa5c2b6, ground: 0x627b51, leaf: 0x365d47, sun: 0xffe4ac },
  mountain: { sky: 0x91b7ca, fog: 0xb2cdd1, ground: 0x697e68, leaf: 0x2d5a53, sun: 0xffecd0 },
  desert: { sky: 0xbcb5a2, fog: 0xd4c09e, ground: 0xa78c5d, leaf: 0x6e7860, sun: 0xffd49b },
  night: { sky: 0x152e49, fog: 0x284a5a, ground: 0x2c4845, leaf: 0x193b38, sun: 0x96c8e2 },
  volcano: { sky: 0x473636, fog: 0x6b4c40, ground: 0x51433b, leaf: 0x3b3932, sun: 0xffaa63 },
};
const v3 = new T.Vector3();
export class HuntScene {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(52, 1, 0.15, 220);
  yaw = 0;
  pitch = 0.32;
  distance = 15;
  locked = true;
  fps = 60;
  quality: string;
  private environment = new T.Group();
  private actors = new T.Group();
  private fx = new T.Group();
  private rig: Rig | null = null;
  private hunters = new Map<string, Rig>();
  private hazardMeshes = new Map<number, T.Mesh>();
  private effectMeshes = new Map<number, T.Mesh>();
  private labels = new Map<number, HTMLElement>();
  private ring: T.Mesh;
  private telegraph: T.Mesh;
  private trail: T.Mesh;
  private breath: T.Mesh;
  private stars: T.Points | null = null;
  private last = 0;
  private frames = 0;
  private fpsTime = 0;
  private clock = 0;
  private currentId = '';
  private biome: Biome = 'forest';
  private resize: ResizeObserver;
  private target = new T.Vector3();
  private light: T.DirectionalLight;
  private onContextLost: (e: Event) => void;
  constructor(
    private container: HTMLDivElement,
    private settings: Settings,
    private onError: (message: string) => void,
  ) {
    this.quality = settings.quality;
    this.renderer = new T.WebGLRenderer({
      antialias: settings.quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(this.ratio());
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled =
      settings.quality === 'high' ||
      (settings.quality === 'auto' && !matchMedia('(pointer:coarse)').matches);
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '3D狩猟フィールド');
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    this.onContextLost = (e) => {
      e.preventDefault();
      onError('3D描画が中断しました。画質を下げてページを再読み込みしてください。');
    };
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.scene.add(this.environment, this.actors, this.fx);
    this.scene.add(new T.HemisphereLight(0xd5eeea, 0x3e5140, 2.1));
    this.light = new T.DirectionalLight(0xffe3b5, 3);
    this.light.position.set(-25, 45, 20);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    Object.assign(this.light.shadow.camera, {
      left: -42,
      right: 42,
      top: 42,
      bottom: -42,
      far: 120,
    });
    this.light.shadow.bias = -0.001;
    this.scene.add(this.light);
    const ringGeo = new T.RingGeometry(3.8, 3.93, 64);
    this.ring = new T.Mesh(
      ringGeo,
      new T.MeshBasicMaterial({
        color: 0xf2d493,
        transparent: true,
        opacity: 0.5,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    this.fx.add(this.ring);
    this.telegraph = new T.Mesh(
      new T.CircleGeometry(1, 64),
      new T.MeshBasicMaterial({
        color: 0xff5e36,
        transparent: true,
        opacity: 0.22,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    this.telegraph.rotation.x = -Math.PI / 2;
    this.telegraph.position.y = 0.09;
    this.fx.add(this.telegraph);
    this.trail = new T.Mesh(
      new T.RingGeometry(2, 2.7, 24, 1, 0, Math.PI * 1.3),
      new T.MeshBasicMaterial({
        color: 0xffe7a6,
        transparent: true,
        opacity: 0.7,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    this.trail.rotation.x = -Math.PI / 2;
    this.fx.add(this.trail);
    this.breath = new T.Mesh(
      new T.IcosahedronGeometry(1, 1),
      new T.MeshBasicMaterial({ color: 0xffc16c, transparent: true, opacity: 0.85 }),
    );
    this.breath.visible = false;
    this.fx.add(this.breath);
    this.resize = new ResizeObserver(() => this.setSize());
    this.resize.observe(container);
    this.setSize();
  }
  private ratio() {
    return Math.min(
      devicePixelRatio,
      this.settings.quality === 'high' ? 2 : this.settings.quality === 'low' ? 1 : 1.4,
    );
  }
  updateSettings(s: Settings) {
    this.settings = s;
    this.renderer.setPixelRatio(this.ratio());
    this.renderer.shadowMap.enabled =
      s.quality === 'high' || (s.quality === 'auto' && !matchMedia('(pointer:coarse)').matches);
  }
  private setSize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (w && h) {
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.fov = w / h < 0.8 ? 64 : 52;
      this.camera.updateProjectionMatrix();
    }
  }
  private buildEnvironment(biome: Biome) {
    disposeGroup(this.environment);
    const p = palettes[biome];
    this.biome = biome;
    this.scene.background = new T.Color(p.sky);
    this.scene.fog = new T.FogExp2(p.fog, biome === 'night' ? 0.014 : 0.009);
    this.light.color.setHex(p.sun);
    this.light.intensity = biome === 'night' ? 1.4 : 3;
    let seed = 771;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const geo = new T.PlaneGeometry(220, 220, 100, 100);
    geo.rotateX(-Math.PI / 2);
    const positions = geo.attributes.position;
    const colors: number[] = [];
    const base = new T.Color(p.ground),
      soil = new T.Color(biome === 'desert' ? 0xb9a078 : biome === 'volcano' ? 0x665044 : 0x929074);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i),
        r = Math.hypot(x, z);
      const hills = Math.max(0, r - 38) * 0.12 * (Math.sin(x * 0.13) * Math.cos(z * 0.17) + 1);
      positions.setY(i, r < 39 ? -0.02 : hills);
      const n = random();
      const c = base
        .clone()
        .lerp(soil, (Math.sin(x * 0.08 + z * 0.08) > 0.6 ? 0.6 : 0.1) + n * 0.22)
        .multiplyScalar(0.87 + n * 0.2);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
    );
    ground.receiveShadow = true;
    this.environment.add(ground);
    const trunkGeo = new T.CylinderGeometry(0.35, 0.65, 6, 6),
      leafGeo = new T.IcosahedronGeometry(1, 0),
      rockGeo = new T.IcosahedronGeometry(1, 0);
    const trunks = new T.InstancedMesh(trunkGeo, material('#554d3b'), 100),
      leaves = new T.InstancedMesh(leafGeo, material(new T.Color(p.leaf).getStyle()), 200),
      rocks = new T.InstancedMesh(
        rockGeo,
        material(biome === 'volcano' ? '#473e38' : '#7b8271'),
        95,
      );
    const dummy = new T.Object3D();
    for (let i = 0; i < 100; i++) {
      const a = random() * Math.PI * 2,
        r = 43 + random() * 48,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r,
        h = 4 + random() * 9;
      dummy.position.set(x, h * 0.5, z);
      dummy.rotation.set(0, a, 0);
      dummy.scale.set(1, h / 6, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let j = 0; j < 2; j++) {
        dummy.position.y = h + j * 2.2;
        dummy.scale.set(3 + random() * 2, 3 + random() * 2, 3 + random() * 2);
        dummy.updateMatrix();
        leaves.setMatrixAt(i * 2 + j, dummy.matrix);
      }
    }
    if (biome !== 'desert' && biome !== 'volcano') {
      trunks.castShadow = true;
      leaves.castShadow = true;
      this.environment.add(trunks, leaves);
    } else {
      trunks.geometry.dispose();
      leaves.geometry.dispose();
    }
    for (let i = 0; i < 95; i++) {
      const a = random() * Math.PI * 2,
        r = 41 + random() * 50;
      dummy.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      dummy.rotation.set(random(), random() * 6, random());
      const s = 1 + random() * 7;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.environment.add(rocks);
    const mountains = new T.InstancedMesh(
      new T.ConeGeometry(1, 1, 5),
      material(biome === 'desert' ? '#8f806a' : '#617d7b'),
      26,
    );
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      dummy.position.set(Math.sin(a) * 100, 10, Math.cos(a) * 100);
      dummy.rotation.set(0, a, 0);
      dummy.scale.set(12 + random() * 14, 22 + random() * 35, 12 + random() * 14);
      dummy.updateMatrix();
      mountains.setMatrixAt(i, dummy.matrix);
    }
    this.environment.add(mountains);
    const grass = new T.InstancedMesh(
      new T.ConeGeometry(0.15, 0.65, 3),
      material(biome === 'desert' ? '#aea073' : '#7b9868'),
      550,
    );
    for (let i = 0; i < 550; i++) {
      const a = random() * 6.28,
        r = 8 + random() * 34;
      dummy.position.set(Math.sin(a) * r, 0.2, Math.cos(a) * r);
      dummy.rotation.set(0, random() * 6, random() * 0.3);
      dummy.scale.setScalar(0.5 + random());
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    if (biome !== 'volcano') this.environment.add(grass);
    else grass.geometry.dispose();
    const pool = new T.Mesh(
      new T.CircleGeometry(18, 60),
      new T.MeshStandardMaterial({
        color: biome === 'volcano' ? 0xe35c26 : 0x4f9693,
        metalness: 0.4,
        roughness: 0.23,
        emissive: biome === 'volcano' ? 0xc93a0c : 0x000000,
        emissiveIntensity: 0.7,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-52, 0.15, -15);
    this.environment.add(pool);
    const tent = new T.Mesh(new T.ConeGeometry(2.8, 4, 4), material('#c5b187'));
    tent.position.set(12, 1.9, 32);
    tent.rotation.y = Math.PI / 4;
    tent.castShadow = true;
    this.environment.add(tent);
    const fire = new T.Mesh(
      new T.IcosahedronGeometry(0.55, 0),
      new T.MeshBasicMaterial({ color: 0xffb44f }),
    );
    fire.position.set(8, 0.6, 31);
    this.environment.add(fire);
    const point = new T.PointLight(0xffa84e, 12, 10);
    point.position.copy(fire.position).y += 1;
    this.environment.add(point);
    const boundary = new T.Mesh(
      new T.RingGeometry(38.6, 38.72, 120),
      new T.MeshBasicMaterial({
        color: 0xd6bb7c,
        transparent: true,
        opacity: 0.23,
        side: T.DoubleSide,
      }),
    );
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.02;
    this.environment.add(boundary);
    const dustPositions = [];
    for (let i = 0; i < 140; i++)
      dustPositions.push((random() - 0.5) * 90, random() * 20 + 1, (random() - 0.5) * 90);
    const dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute('position', new T.Float32BufferAttribute(dustPositions, 3));
    this.stars = new T.Points(
      dustGeo,
      new T.PointsMaterial({
        color: biome === 'volcano' ? 0xffa852 : 0xe1ecc1,
        size: biome === 'night' ? 0.13 : 0.08,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.environment.add(this.stars);
  }
  private setup(id: MonsterId) {
    if (this.currentId === id) return;
    this.currentId = id;
    this.buildEnvironment(monster(id).biome);
    if (this.rig) {
      this.actors.remove(this.rig.root);
      disposeGroup(this.rig.root);
    }
    this.rig = makeMonster(id);
    this.actors.add(this.rig.root);
  }
  render(w: World | null, playerId: string, preview: MonsterId, time: number) {
    const dt = Math.min((time - this.last) / 1000, 0.05) || 0.016;
    this.last = time;
    this.clock += dt;
    this.frames++;
    if (time - this.fpsTime > 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsTime = time;
      if (this.settings.quality === 'auto' && this.fps < 25) {
        this.renderer.setPixelRatio(
          Math.min(this.renderer.getPixelRatio(), this.fps < 12 ? 0.75 : 1),
        );
        this.renderer.shadowMap.enabled = false;
      }
    }
    this.setup(w?.monster.id || preview);
    const rig = this.rig!,
      m = w?.monster,
      t = this.clock;
    if (m) {
      rig.root.position.lerp(v3.set(m.x, 0, m.z), 1 - Math.exp(-dt * 15));
      let diff = Math.atan2(
        Math.sin(m.yaw - rig.root.rotation.y),
        Math.cos(m.yaw - rig.root.rotation.y),
      );
      rig.root.rotation.y += diff * Math.min(1, dt * 12);
    } else {
      rig.root.position.set(0, 0, 0);
      rig.root.rotation.y = -0.55 + Math.sin(t * 0.12) * 0.1;
    }
    const walk = m?.mode === 'stalk' || (m?.mode === 'attack' && m.move === 'charge');
    const dead = m?.mode === 'dead',
      down = m?.mode === 'stagger';
    rig.body.position.y = dead ? -0.6 : down ? -0.7 : Math.sin(t * 2) * 0.08;
    rig.body.rotation.z = T.MathUtils.damp(rig.body.rotation.z, dead ? 1.2 : down ? 0.5 : 0, 8, dt);
    rig.head.rotation.x = m?.mode === 'windup' ? -0.2 : Math.sin(t * 1.5) * 0.07;
    rig.limbs.forEach(
      (l, i) =>
        (l.rotation.x = walk
          ? Math.sin(t * (m?.enraged ? 11 : 8) + i * Math.PI * 0.7) * 0.5
          : Math.sin(t * 2 + i) * 0.04),
    );
    rig.wings.forEach(
      (wing, i) =>
        (wing.rotation.z =
          (i === 0 ? -1 : 1) *
          (Math.sin(t * (m?.move === 'leap' ? 6 : 1.6)) * 0.2 + (m?.mode === 'windup' ? 0.3 : 0))),
    );
    rig.tail.rotation.y =
      Math.sin(t * 2) * 0.16 + (m?.mode === 'attack' && m.move === 'tail' ? Math.sin(t * 16) : 0);
    rig.tail.visible = !m?.tailBroken;
    rig.spikes.visible = !m?.headBroken;
    if (m?.mode === 'attack' && m.move === 'leap')
      rig.body.position.y += Math.sin(Math.PI * (1 - m.timer / m.duration)) * 4;
    rig.eyes.forEach(
      (e) => ((e.material as T.MeshStandardMaterial).emissiveIntensity = m?.enraged ? 3 : 1.5),
    );
    this.breath.visible = !!m && m.mode === 'attack' && (m.move === 'fire' || m.move === 'beam');
    if (m && this.breath.visible) {
      const from = new T.Vector3(
        m.x + Math.sin(m.yaw) * 4,
        monster(m.id).species === '飛竜種' ? 4.3 : 3,
        m.z + Math.cos(m.yaw) * 4,
      );
      if (m.move === 'beam') {
        this.breath.position
          .copy(from)
          .add(v3.set(Math.sin(m.yaw) * 12, -0.3, Math.cos(m.yaw) * 12));
        this.breath.rotation.set(0, m.yaw, 0);
        this.breath.scale.set(1.2, 1.2, 15);
        (this.breath.material as T.MeshBasicMaterial).color.setHex(0xc1edff);
      } else {
        const progress = Math.min(1, (1 - m.timer / m.duration) * 1.8);
        this.breath.position.copy(from).lerp(v3.set(m.targetX, 0.8, m.targetZ), progress);
        this.breath.scale.setScalar(0.8 + progress * 0.7);
        (this.breath.material as T.MeshBasicMaterial).color.setHex(0xffaa47);
      }
    }
    this.ring.visible = !!w && this.locked;
    this.ring.position.set(m?.x || 0, 0.13, m?.z || 0);
    this.ring.rotation.z = t * 0.15;
    this.telegraph.visible = !!m && (m.mode === 'windup' || m.mode === 'attack');
    if (m) {
      const linear = m.move === 'charge' || m.move === 'beam',
        targeted = ['fire', 'thunder', 'leap'].includes(m.move);
      this.telegraph.position.set(
        targeted ? m.targetX : linear ? m.x + Math.sin(m.yaw) * 10 : m.x,
        0.07,
        targeted ? m.targetZ : linear ? m.z + Math.cos(m.yaw) * 10 : m.z,
      );
      this.telegraph.scale.set(
        linear ? 3 : targeted ? 5 : m.move === 'tail' ? 8 : 6.5,
        linear ? 13 : targeted ? 5 : m.move === 'tail' ? 8 : 6.5,
        1,
      );
      this.telegraph.rotation.set(-Math.PI / 2, 0, -m.yaw);
      (this.telegraph.material as T.MeshBasicMaterial).opacity = 0.15 + Math.sin(t * 12) * 0.07;
    }
    const p = w?.players.find((p) => p.id === playerId);
    this.trail.visible = false;
    const ids = new Set(w?.players.map((p) => p.id) || []);
    for (const [id, h] of this.hunters)
      if (!ids.has(id)) {
        this.actors.remove(h.root);
        disposeGroup(h.root);
        this.hunters.delete(id);
      }
    w?.players.forEach((p, i) => {
      let h = this.hunters.get(p.id);
      if (h && h.root.userData.weapon !== p.weapon) {
        this.actors.remove(h.root);
        disposeGroup(h.root);
        this.hunters.delete(p.id);
        h = undefined;
      }
      if (!h) {
        h = makeHunter(p.weapon, ['#72a899', '#809dc1', '#ba8267', '#bca368'][i], p.bot);
        h.root.userData.weapon = p.weapon;
        h.root.position.set(p.x, 0, p.z);
        this.hunters.set(p.id, h);
        this.actors.add(h.root);
      }
      h.root.visible = p.connected;
      const old = h.root.position.clone();
      h.root.position.lerp(v3.set(p.x, 0, p.z), 1 - Math.exp(-dt * 20));
      const moving = old.distanceTo(h.root.position) > 0.015;
      h.root.rotation.y +=
        Math.atan2(Math.sin(p.yaw - h.root.rotation.y), Math.cos(p.yaw - h.root.rotation.y)) *
        Math.min(1, dt * 20);
      h.body.rotation.x = p.action === 'down' ? Math.PI / 2 : 0;
      h.body.rotation.z = p.action === 'dodge' ? (1 - p.timer / p.duration) * Math.PI * 2 : 0;
      h.body.position.y =
        p.weapon === 'insectglaive' && p.action === 'special'
          ? Math.sin((1 - p.timer / p.duration) * Math.PI) * 3
          : Math.sin(t * 12) * Number(moving) * 0.06;
      h.limbs.forEach((l, j) => (l.rotation.x = moving ? Math.sin(t * 12 + j * Math.PI) * 0.5 : 0));
      const attack = p.action === 'attack' || p.action === 'special';
      const progress = attack ? 1 - p.timer / p.duration : 0;
      h.tool.rotation.x = attack
        ? -0.8 + Math.sin(progress * Math.PI * 1.4) * 3
        : p.charge > 0
          ? -1.8
          : 0.25;
      h.tool.rotation.z = attack ? Math.sin(progress * Math.PI * 2) * 1.8 : -0.2;
      if (attack && progress > 0.3 && progress < 0.8 && p.id === playerId) {
        this.trail.visible = true;
        this.trail.position.set(p.x, 1.3, p.z);
        this.trail.rotation.z = -p.yaw + progress * 5;
        this.trail.scale.setScalar(p.action === 'special' ? 1.7 : 1);
      }
      h.root.traverse((o) => {
        if (o instanceof T.Mesh)
          o.visible =
            p.invincible > 0.2 && p.action === 'hurt' ? Math.floor(t * 18) % 2 === 0 : true;
      });
    });
    this.renderEffects(w, dt);
    if (p && w) {
      if (this.locked && m) {
        const aim = Math.atan2(m.x - p.x, m.z - p.z) + Math.PI;
        this.yaw +=
          Math.atan2(Math.sin(aim - this.yaw), Math.cos(aim - this.yaw)) * Math.min(1, dt * 3);
      }
      this.target.lerp(v3.set(p.x, 2.1, p.z), 1 - Math.exp(-dt * 10));
      const dist = this.camera.aspect < 0.8 ? this.distance * 1.18 : this.distance;
      const pos = new T.Vector3(
        this.target.x + Math.sin(this.yaw) * dist * Math.cos(this.pitch),
        this.target.y + Math.sin(this.pitch) * dist,
        this.target.z + Math.cos(this.yaw) * dist * Math.cos(this.pitch),
      );
      this.camera.position.lerp(pos, 1 - Math.exp(-dt * 10));
      this.camera.lookAt(this.target.x, this.target.y + 1.2, this.target.z);
      if (this.settings.shake && p.action === 'hurt') {
        this.camera.position.x += Math.sin(t * 90) * 0.08;
        this.camera.position.y += Math.cos(t * 81) * 0.08;
      }
    } else {
      this.camera.position.set(12 + Math.sin(t * 0.08) * 3, 7, 19);
      this.camera.lookAt(0, 2, 0);
    }
    if (this.stars) this.stars.rotation.y = t * 0.005;
    this.renderer.render(this.scene, this.camera);
    for (const [id, label] of this.labels) {
      const e = w?.effects.find((e) => e.id === id);
      if (!e) {
        label.remove();
        this.labels.delete(id);
        continue;
      }
      v3.set(e.x, 3.4 + (1 - e.life) * 2, e.z).project(this.camera);
      label.style.transform = `translate(-50%,-50%) translate(${(v3.x * 0.5 + 0.5) * this.container.clientWidth}px,${(-v3.y * 0.5 + 0.5) * this.container.clientHeight}px)`;
      label.style.opacity = String(Math.min(1, e.life * 3));
      label.hidden = v3.z > 1;
    }
  }
  private renderEffects(w: World | null, dt: number) {
    const hazardIds = new Set(w?.hazards.map((h) => h.id) || []);
    for (const [id, m] of this.hazardMeshes)
      if (!hazardIds.has(id)) {
        this.fx.remove(m);
        m.geometry.dispose();
        (m.material as T.Material).dispose();
        this.hazardMeshes.delete(id);
      }
    w?.hazards.forEach((h) => {
      let mesh = this.hazardMeshes.get(h.id);
      if (!mesh) {
        mesh = new T.Mesh(
          new T.RingGeometry(0.65, 1, 32),
          new T.MeshBasicMaterial({
            color:
              h.type === 'fire'
                ? 0xff873f
                : h.type === 'thunder'
                  ? 0x80dbf9
                  : h.type === 'trap'
                    ? 0x88e6ad
                    : 0xffd37a,
            transparent: true,
            opacity: 0.5,
            side: T.DoubleSide,
            depthWrite: false,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        this.hazardMeshes.set(h.id, mesh);
        this.fx.add(mesh);
      }
      mesh.position.set(h.x, 0.15, h.z);
      mesh.scale.setScalar(h.radius * (h.delay > 0 ? 1 : 1 + Math.sin(this.clock * 12) * 0.05));
    });
    const effectIds = new Set(w?.effects.map((e) => e.id) || []);
    for (const [id, mesh] of this.effectMeshes)
      if (!effectIds.has(id)) {
        this.fx.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
        this.effectMeshes.delete(id);
      }
    w?.effects.forEach((e) => {
      if (!this.effectMeshes.has(e.id)) {
        const heal = e.type === 'heal' || e.type === 'buff';
        const mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial> = new T.Mesh(
          new T.IcosahedronGeometry(e.type === 'blast' ? 2.5 : 0.5, 0),
          new T.MeshBasicMaterial({
            color: heal ? 0x9be4b0 : e.value < 0 ? 0xed7257 : 0xffd58a,
            transparent: true,
            opacity: 0.8,
            wireframe: e.type === 'break' || heal,
          }),
        );
        mesh.position.set(e.x, 2, e.z);
        if (e.type === 'shot') {
          const owner = w.players.find((p) => p.id === e.owner);
          if (owner) {
            const origin = new T.Vector3(owner.x, 1.6, owner.z),
              end = new T.Vector3(e.x, 3, e.z);
            mesh.geometry.dispose();
            mesh.geometry = new T.CylinderGeometry(0.035, 0.035, origin.distanceTo(end), 5);
            mesh.position.copy(origin).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.sub(origin).normalize());
          }
        }
        this.effectMeshes.set(e.id, mesh);
        this.fx.add(mesh);
        if (e.value !== 0) {
          const label = document.createElement('span');
          label.className = `damage-number ${heal ? 'healing' : e.value < 0 ? 'damage-taken' : ''}`;
          label.textContent = heal ? `+${e.value}` : String(Math.abs(e.value));
          this.container.appendChild(label);
          this.labels.set(e.id, label);
        }
      }
      const mesh = this.effectMeshes.get(e.id)!;
      if (e.type === 'shot') {
        (mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, e.life - 0.75) * 3;
      } else {
        mesh.rotation.y += dt * 8;
        mesh.scale.setScalar((1 - e.life) * 3 + 0.2);
        (mesh.material as T.MeshBasicMaterial).opacity = e.life * 0.75;
      }
    });
  }
  dispose() {
    this.resize.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.labels.forEach((l) => l.remove());
    disposeGroup(this.environment);
    disposeGroup(this.actors);
    disposeGroup(this.fx);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
