import { useEffect, useState } from 'react';
import * as T from 'three';
import { makeMonster, disposeGroup } from '../game/models';
import { MONSTERS, type MonsterId } from '../game/data';
let portraits: Record<string, string> | null = null;
function createPortraits() {
  if (portraits) return portraits;
  portraits = {};
  try {
    const renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(480, 300);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xdcf2ef, 0x5a6758, 3));
    const light = new T.DirectionalLight(0xffd1a4, 4);
    light.position.set(-5, 9, 8);
    scene.add(light);
    const camera = new T.PerspectiveCamera(40, 1.6, 0.1, 100);
    camera.position.set(12, 7, 15);
    camera.lookAt(0, 1.8, 0);
    for (const m of MONSTERS) {
      const rig = makeMonster(m.id);
      rig.root.rotation.y = -0.25;
      scene.add(rig.root);
      renderer.render(scene, camera);
      portraits[m.id] = renderer.domElement.toDataURL('image/webp', 0.85);
      scene.remove(rig.root);
      disposeGroup(rig.root);
    }
    renderer.dispose();
    renderer.forceContextLoss();
  } catch {
    /* The playable scene presents a WebGL error with recovery guidance. */
  }
  return portraits;
}
export function MonsterPortrait({ id, className = '' }: { id: MonsterId; className?: string }) {
  const [src, setSrc] = useState(portraits?.[id] || '');
  useEffect(() => {
    setSrc(createPortraits()[id] || '');
  }, [id]);
  return src ? (
    <img className={`monster-portrait ${className}`} src={src} alt="" draggable={false} />
  ) : (
    <span className="portrait-placeholder" aria-hidden="true">
      ◇
    </span>
  );
}
