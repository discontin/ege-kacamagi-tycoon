import * as T from 'three';
import { foldedTowel } from './FoldedTowel';

/** Shelf and stock share one coordinate system so folded towels never float outside it. */
export class TowelShelf {
  readonly root = new T.Group();
  readonly towels: T.Mesh[] = [];
  constructor(material: (color: number) => T.Material, height = 2.2, dirty = false, frame = true) {
    const box = (color: number, x: number, y: number, z: number, w: number, h: number, d: number, parent: T.Object3D = this.root) => {
      const geometry = new T.BoxGeometry(w, h, d); geometry.userData.generated = true;
      const mesh = new T.Mesh(geometry, material(color)); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    if (frame) {
      for (const x of [-1, 1]) box(0xc9a376, x, 1.1, 0, .12, 2.2, 1);
      box(0xe2c79e, 0, 1.1, -.47, 2, 2.2, .08);
      for (const y of [.28, .96, 1.64, 2.16]) box(0xe6c69a, 0, y, 0, 2, .08, 1);
    }
    for (let i = 0; i < 12; i++) {
      const level = Math.floor(i / 4), column = i % 2, layer = Math.floor(i % 4 / 2);
      const towel = foldedTowel(material, dirty);
      towel.position.set(column ? .46 : -.46, .38 + level * .68 + layer * .14, 0); this.root.add(towel);
      this.towels.push(towel);
    }
    this.root.scale.setScalar(height / 2.2);
  }
}
