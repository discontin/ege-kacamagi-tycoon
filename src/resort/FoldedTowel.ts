import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Rounded folded cloth, with a visible folded edge and woven border. */
export function foldedTowel(material: (color: number) => T.Material, dirty = false): T.Mesh {
  const geometry = new RoundedBoxGeometry(.76, .12, .64, 2, .035); geometry.userData.generated = true;
  const towel = new T.Mesh(geometry, material(dirty ? 0xa99480 : 0xfff9ed));
  towel.castShadow = towel.receiveShadow = true;
  const detail = (color: number, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(h / 3, .012)); g.userData.generated = true;
    const m = new T.Mesh(g, material(color)); m.position.set(x, y, z); towel.add(m);
  };
  detail(dirty ? 0x887464 : 0xe4d7bf, 0, -.015, .319, .66, .012, .014);
  for (const x of [-.25, -.22]) detail(dirty ? 0x796f57 : 0x57b7b3, x, .059, 0, .018, .006, .55);
  detail(dirty ? 0x887464 : 0xe4d7bf, 0, .025, .318, .68, .008, .012);
  return towel;
}
