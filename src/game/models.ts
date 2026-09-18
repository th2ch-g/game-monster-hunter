import * as T from 'three';
import { monster, weapon, type MonsterId, type WeaponId } from './data';
export interface Rig {
  root: T.Group;
  body: T.Group;
  head: T.Group;
  limbs: T.Group[];
  wings: T.Group[];
  tail: T.Group;
  tool: T.Group;
  eyes: T.Mesh[];
  spikes: T.Group;
}
const materials = new Map<string, T.MeshStandardMaterial>();
export function material(color: string, metalness = 0.08, emissive = false) {
  const key = `${color}:${metalness}:${emissive}`;
  let m = materials.get(key);
  if (!m) {
    m = new T.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness,
      flatShading: true,
      emissive: emissive ? color : '#000000',
      emissiveIntensity: emissive ? 1.5 : 0,
    });
    materials.set(key, m);
  }
  return m;
}
const sphere = new T.IcosahedronGeometry(1, 1),
  box = new T.BoxGeometry(1, 1, 1),
  cone = new T.ConeGeometry(1, 1, 6),
  cylinder = new T.CylinderGeometry(1, 1, 1, 7);
export function shape(
  parent: T.Object3D,
  geo: T.BufferGeometry,
  color: string,
  pos: number[],
  scale: number[],
  metal = 0.08,
) {
  const m = new T.Mesh(geo, material(color, metal));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function ball(p: T.Object3D, c: string, pos: number[], s: number[]) {
  return shape(p, sphere, c, pos, s);
}
function joint(p: T.Object3D, x: number, y: number, z: number) {
  const g = new T.Group();
  g.position.set(x, y, z);
  p.add(g);
  return g;
}
function bone(p: T.Object3D, a: T.Vector3, b: T.Vector3, r: number, c: string) {
  const m = shape(p, cylinder, c, a.clone().add(b).multiplyScalar(0.5).toArray(), [
    r,
    a.distanceTo(b),
    r,
  ]);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
export function makeMonster(id: MonsterId): Rig {
  const d = monster(id),
    root = new T.Group(),
    body = joint(root, 0, 0, 0),
    head = joint(body, 0, 2.6, 2.6),
    tail = joint(body, 0, 2, -2.3),
    spikes = joint(body, 0, 0, 0);
  const limbs: T.Group[] = [],
    wings: T.Group[] = [],
    eyes: T.Mesh[] = [];
  const c = d.color,
    a = d.accent,
    belly = id === 'rajang' ? '#322b28' : '#b5a47f';
  const isApe = id === 'rajang',
    isWolf = id === 'zinogre',
    isWyvern = ['rathalos', 'rathian'].includes(id),
    isCat = id === 'nargacuga';
  ball(
    body,
    c,
    [0, isWyvern ? 3.8 : 2.5, 0],
    [isWyvern ? 1.5 : 1.9, isApe ? 2 : 1.45, isApe ? 1.3 : 3],
  );
  ball(body, belly, [0, isWyvern ? 2.95 : 1.65, 1], [isWyvern ? 1.1 : 1.4, 0.7, 1.85]);
  if (isWyvern) {
    head.position.set(0, 4.35, 3.1);
    head.scale.set(0.85, 0.85, 1.1);
    tail.position.y = 3.6;
    ball(body, c, [0, 4, 2.1], [0.9, 1.15, 1.45]);
  }
  if (isApe) {
    head.position.set(0, 4, 1);
    ball(body, c, [0, 3.6, 0], [2.3, 1.45, 1.4]);
  }
  ball(head, c, [0, 0.1, 0.2], [isApe ? 1 : 1.05, 0.9, isApe ? 0.9 : 1.55]);
  ball(head, belly, [0, -0.4, 1], [0.78, 0.34, 1.1]);
  ball(head, c, [0, 0, 1.2], [0.83, 0.46, 1.1]);
  shape(head, box, '#252723', [0, -0.24, 1.66], [1.4, 0.14, 0.95]);
  for (const s of [-1, 1]) {
    const eye = shape(
      head,
      sphere,
      isCat ? '#ff3b32' : '#ffbf46',
      [s * 0.86, 0.24, 0.93],
      [0.16, 0.14, 0.3],
    );
    eye.material = material(isCat ? '#ff3b32' : '#ffbf46', 0, true);
    eyes.push(eye);
    ball(head, c, [s * 0.88, 0.46, 0.77], [0.26, 0.18, 0.65]);
    for (let t = 0; t < 3; t++) {
      const tooth = shape(
        head,
        cone,
        '#eee0b8',
        [s * 0.58, -0.28, 1.25 + t * 0.38],
        [0.12, 0.32, 0.13],
      );
      tooth.rotation.z = Math.PI;
    }
    const horn = shape(
      head,
      cone,
      isWolf || isApe ? '#ead5a0' : c,
      [s * 0.7, 1, 0],
      [0.27, isApe ? 1.8 : 0.95, 0.33],
    );
    horn.rotation.z = -s * 0.55;
    horn.rotation.x = -0.4;
    if (isCat) {
      const ear = shape(head, cone, c, [s * 0.78, 1, 0.1], [0.52, 0.9, 0.22]);
      ear.rotation.z = -s * 0.4;
    }
  }
  for (let i = 0; i < (isApe ? 3 : 7); i++) {
    const s = shape(
      spikes,
      cone,
      a,
      [0, (isWyvern ? 5 : 3.65) - i * 0.09, 1.6 - i * 0.65],
      [0.32, isWolf ? 1.4 : 0.85, 0.42],
    );
    s.rotation.x = -0.4;
  }
  if (isWolf || isApe)
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const s = shape(
        spikes,
        cone,
        isWolf ? '#e1d4a8' : a,
        [Math.cos(angle) * 1.5, 3.4 + Math.sin(angle) * 0.6, isWolf ? 1.6 : 0.2],
        [0.37, isWolf ? 1.25 : 1.1, 0.5],
      );
      s.rotation.z = -Math.cos(angle) * 0.85;
      s.rotation.x = -0.3;
    }
  for (const s of [-1, 1])
    for (let j = 0; j < 2; j++) {
      const front = j === 0,
        limb = joint(
          body,
          s * (isApe && front ? 2 : 1.45),
          isApe && front ? 3.5 : isWyvern ? 3.5 : 2.2,
          front ? 1.65 : -1.6,
        );
      limbs.push(limb);
      ball(limb, c, [s * 0.25, -0.5, 0.05], [front && isApe ? 0.85 : 0.65, 1, 0.75]);
      ball(limb, a, [s * 0.35, -1.15, 0.35], [front && isWolf ? 0.9 : 0.5, 0.85, 0.55]);
      ball(limb, c, [s * 0.35, -1.85, 0.55], [0.58, 0.35, 0.86]);
      for (let k = 0; k < 3; k++) {
        const claw = shape(
          limb,
          cone,
          '#d4c6a4',
          [s * 0.35 + (k - 1) * 0.33, -1.94, 1.18],
          [0.12, 0.6, 0.13],
        );
        claw.rotation.x = Math.PI / 2;
      }
      if (isWyvern && front) limb.scale.set(0.35, 0.5, 0.35);
      else if (isWyvern) limb.scale.set(0.85, 1.65, 0.9);
    }
  let segment = tail;
  for (let i = 0; i < (isApe ? 5 : 7); i++) {
    const next = joint(segment, 0, i === 0 ? 0 : -0.04, -(i === 0 ? 0 : 0.85));
    const radius = (1 - i * 0.115) * (isApe ? 0.35 : 1);
    ball(next, c, [0, 0, -0.5], [radius, radius * 0.75, 0.9]);
    if (!isApe) {
      const spike = shape(next, cone, a, [0, radius * 0.8, -0.5], [0.2, 0.6, 0.28]);
      spike.rotation.x = -0.5;
    }
    segment = next;
  }
  if (isWyvern || id === 'tigrex' || isCat) {
    for (const s of [-1, 1]) {
      const wing = joint(body, s * 1.4, isWyvern ? 4.8 : 2.9, 0.9);
      wings.push(wing);
      const length = isWyvern ? 7.5 : 3.4;
      const points = [
        new T.Vector3(0, 0, 0),
        new T.Vector3(s * length * 0.5, isWyvern ? 2.5 : 1.45, -0.1),
        new T.Vector3(s * length, isWyvern ? 1.8 : 1, -2),
        new T.Vector3(s * length * 0.68, 0.1, -3.5),
        new T.Vector3(s * length * 0.3, -0.2, -2.8),
        new T.Vector3(0, -0.1, -1.3),
      ];
      const vertices: number[] = [];
      for (let i = 1; i < points.length - 1; i++)
        vertices.push(...points[0].toArray(), ...points[i].toArray(), ...points[i + 1].toArray());
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      g.computeVertexNormals();
      const membrane = new T.Mesh(
        g,
        new T.MeshStandardMaterial({
          color: isWyvern ? '#844b39' : c,
          side: T.DoubleSide,
          roughness: 0.93,
          flatShading: true,
        }),
      );
      wing.add(membrane);
      membrane.castShadow = true;
      if (isWyvern) {
        const marks: number[] = [];
        for (let i = 1; i < 4; i++) {
          const mid = points[i].clone().lerp(points[i + 1], 0.5);
          marks.push(
            ...points[0]
              .clone()
              .lerp(mid, 0.4)
              .add(new T.Vector3(0, 0.035, 0))
              .toArray(),
            ...points[i]
              .clone()
              .lerp(mid, 0.25)
              .add(new T.Vector3(0, 0.035, 0))
              .toArray(),
            ...mid
              .clone()
              .add(new T.Vector3(0, 0.035, 0))
              .toArray(),
          );
        }
        const marking = new T.BufferGeometry();
        marking.setAttribute('position', new T.Float32BufferAttribute(marks, 3));
        marking.computeVertexNormals();
        wing.add(
          new T.Mesh(
            marking,
            new T.MeshStandardMaterial({ color: '#382f29', side: T.DoubleSide, roughness: 1 }),
          ),
        );
      }
      for (let i = 1; i < points.length; i++)
        bone(wing, points[0], points[i], i === 1 ? 0.19 : 0.07, c);
      ball(wing, c, points[1].toArray(), [0.4, 0.4, 0.4]);
    }
  }
  if (id === 'tigrex')
    for (let i = 0; i < 8; i++) {
      const stripe = shape(body, box, a, [0, 3.7, 1.7 - i * 0.5], [2.4, 0.08, 0.18]);
      stripe.rotation.z = i % 2 ? 0.12 : -0.12;
    }
  if (isCat)
    for (let i = 0; i < 8; i++) ball(body, '#414e60', [0, 3.4, 1.5 - i * 0.6], [1, 0.3, 0.35]);
  const plates = new T.InstancedMesh(sphere, material(c), 42);
  const plate = new T.Object3D();
  for (let i = 0; i < 42; i++) {
    const row = Math.floor(i / 7),
      col = i % 7,
      ang = (row / 5 - 0.5) * 2.4;
    plate.position.set(
      Math.sin(ang) * (isWyvern ? 1.35 : 1.72),
      (isWyvern ? 3.8 : 2.5) + Math.cos(ang) * 1.32,
      2.05 - col * 0.66,
    );
    plate.rotation.set(0.15, 0, -ang);
    plate.scale.set(0.36, 0.16, 0.43);
    plate.updateMatrix();
    plates.setMatrixAt(i, plate.matrix);
    plates.setColorAt(i, new T.Color(c).multiplyScalar(0.68 + (i % 4) * 0.11));
  }
  plates.castShadow = true;
  body.add(plates);
  if (id === 'tigrex')
    for (const limb of limbs)
      for (let i = 0; i < 3; i++) {
        const band = shape(limb, box, a, [0, -0.35 - i * 0.43, 0.4], [0.85, 0.17, 0.55]);
        band.rotation.z = 0.25;
      }
  if (isWyvern) {
    for (const side of [-1, 1]) {
      const crest = shape(head, cone, '#58392c', [side * 0.52, 0.85, -0.3], [0.36, 1.8, 0.42]);
      crest.rotation.x = -0.5;
      crest.rotation.z = -side * 0.2;
      for (let i = 0; i < 4; i++)
        shape(head, cone, c, [side * 0.88, 0.1, 1 - i * 0.45], [0.24, 0.45, 0.28]).rotation.z =
          -side * 1.2;
    }
  }
  root.scale.setScalar(d.size);
  return { root, body, head, tail, limbs, wings, eyes, spikes, tool: new T.Group() };
}
export function makeWeapon(id: WeaponId): T.Group {
  const g = new T.Group(),
    c = weapon(id).color,
    steel = '#c3d1d0',
    dark = '#394a47';
  const pole = (len: number) => {
    shape(g, cylinder, '#5e4832', [0, len / 2, 0], [0.09, len, 0.09]);
    shape(g, box, c, [0, 0.55, 0], [0.45, 0.13, 0.16]);
  };
  if (id === 'bow') {
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(0, -0.4, 0),
      new T.Vector3(0.6, 0.2, 0),
      new T.Vector3(0.85, 1.1, 0),
      new T.Vector3(0.5, 2, 0),
      new T.Vector3(0, 2.5, 0),
    ]);
    g.add(new T.Mesh(new T.TubeGeometry(curve, 12, 0.09, 5, false), material(c)));
    bone(g, new T.Vector3(0, -0.4, 0), new T.Vector3(0, 2.5, 0), 0.014, '#e8dcc8');
  } else if (id.includes('bowgun')) {
    shape(g, box, dark, [0, 0.7, 0], [0.42, 0.8, 0.5]);
    const barrel = shape(
      g,
      cylinder,
      steel,
      [0, 1.4, 0],
      [id === 'heavybowgun' ? 0.22 : 0.14, 1.5, id === 'heavybowgun' ? 0.22 : 0.14],
    );
    barrel.rotation.x = 0.1;
    shape(g, box, c, [0, 1, 0], [0.65, 0.55, 0.7]);
  } else if (id === 'hammer' || id === 'huntinghorn') {
    pole(1.7);
    ball(g, c, [0, 1.8, 0], id === 'hammer' ? [0.65, 0.65, 0.65] : [0.4, 0.95, 0.5]);
    if (id === 'huntinghorn') shape(g, cone, steel, [0, 2.7, 0], [0.4, 0.6, 0.4]);
  } else if (id === 'lance' || id === 'gunlance') {
    pole(3.3);
    shape(g, cone, steel, [0, 3.4, 0], [0.26, 1.3, 0.25]);
    if (id === 'gunlance') shape(g, cylinder, dark, [0, 2, 0], [0.25, 1.5, 0.25]);
  } else if (id === 'switchaxe' || id === 'chargeblade') {
    pole(2.3);
    const blade = shape(g, box, c, [0.35, 2.1, 0], [1.1, 1.1, 0.18]);
    blade.rotation.z = -0.25;
    shape(g, cone, steel, [0.8, 2.3, 0], [0.55, 0.7, 0.13]);
  } else if (id === 'insectglaive') {
    pole(3);
    shape(g, cone, c, [0, 3.1, 0], [0.35, 0.9, 0.16]);
    shape(g, cone, c, [0, -0.2, 0], [0.28, 0.6, 0.13]).rotation.z = Math.PI;
    ball(g, '#8fc7aa', [0.4, 1.7, 0], [0.25, 0.2, 0.35]);
  } else {
    const len = id === 'greatsword' ? 2.7 : id === 'longsword' ? 3 : 1.45;
    pole(0.7);
    shape(g, box, steel, [0, len / 2 + 0.7, 0], [id === 'greatsword' ? 0.68 : 0.18, len, 0.12]);
    shape(g, cone, steel, [0, len + 0.8, 0], [id === 'greatsword' ? 0.4 : 0.15, 0.45, 0.07]);
    shape(g, box, c, [0, 0.65, 0], [0.75, 0.14, 0.22]);
  }
  return g;
}
export function makeHunter(id: WeaponId, color = '#6caca0', palico = false): Rig {
  const root = new T.Group(),
    body = joint(root, 0, 0, 0),
    head = joint(body, 0, 2.05, 0),
    tail = new T.Group(),
    spikes = new T.Group();
  const limbs: T.Group[] = [];
  ball(body, '#334a48', [0, 1.35, 0], [0.49, 0.65, 0.32]);
  shape(body, box, color, [0, 1.6, 0.05], [0.84, 0.62, 0.56]);
  ball(head, '#b3b5a0', [0, 0, 0], [0.33, 0.4, 0.31]);
  shape(head, box, '#1a3030', [0, 0.015, 0.27], [0.46, 0.12, 0.1]);
  shape(head, cone, color, [0, 0.43, -0.08], [0.15, 0.32, 0.12]);
  const cape = shape(body, cone, '#ba6746', [0, 1.15, -0.32], [0.6, 1.5, 0.15]);
  cape.rotation.x = 0.15;
  for (const s of [-1, 1]) {
    const leg = joint(body, s * 0.23, 0.95, 0);
    limbs.push(leg);
    shape(leg, box, '#263b3a', [0, -0.38, 0], [0.27, 0.75, 0.3]);
    ball(leg, '#899789', [0, -0.25, 0.12], [0.2, 0.22, 0.14]);
    shape(leg, box, '#504733', [0, -0.82, 0.1], [0.32, 0.23, 0.47]);
    const arm = joint(body, s * 0.55, 1.7, 0);
    limbs.push(arm);
    ball(arm, color, [0, 0, 0], [0.31, 0.26, 0.34]);
    shape(arm, box, '#b8af92', [0, -0.37, 0], [0.23, 0.7, 0.23]);
    ball(arm, '#403e32', [0, -0.75, 0], [0.18, 0.21, 0.18]);
  }
  const tool = makeWeapon(id);
  tool.position.set(0.63, 0.85, 0.2);
  tool.rotation.z = -0.2;
  tool.rotation.x = 0.25;
  body.add(tool);
  if (weapon(id).guard) {
    const shield = shape(body, sphere, color, [-0.72, 1.18, 0.37], [0.42, 0.56, 0.15]);
    shield.rotation.y = -0.4;
    shape(body, box, '#d6bd7b', [-0.75, 1.18, 0.53], [0.13, 0.8, 0.08]);
  }
  if (id === 'dualblades') {
    const second = makeWeapon(id);
    second.position.set(-0.65, 0.9, 0.3);
    second.rotation.z = 0.2;
    body.add(second);
  }
  if (palico) {
    root.scale.setScalar(0.75);
    ball(head, '#dabf81', [0, 0, 0.08], [0.44, 0.35, 0.4]);
    for (const s of [-1, 1]) shape(head, cone, '#dabf81', [s * 0.3, 0.43, 0], [0.2, 0.45, 0.15]);
  }
  return { root, body, head, tail, limbs, wings: [], tool, eyes: [], spikes };
}
export function disposeGroup(group: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>();
  const mats = new Set<T.Material>();
  group.traverse((o) => {
    if (o instanceof T.Mesh) {
      geometries.add(o.geometry);
      if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m));
      else mats.add(o.material);
    }
  });
  geometries.forEach((g) => {
    if (!([sphere, box, cone, cylinder] as T.BufferGeometry[]).includes(g)) g.dispose();
  });
  mats.forEach((m) => {
    if (![...materials.values()].includes(m as T.MeshStandardMaterial)) m.dispose();
  });
  group.clear();
}
