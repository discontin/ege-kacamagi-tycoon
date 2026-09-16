import * as T from 'three';

/** Crumpled fabric is visual only; cleanliness and towel inventory stay in the simulation. */
export class BedLinen {
  readonly root = new T.Group();
  private fabrics: { mesh: T.Mesh; clean: Float32Array; dirty: Float32Array }[] = [];
  private pillows: T.Mesh[] = [];
  private lastProgress = -1;
  private centerX: number;
  private single: boolean;
  constructor(color: number, material: (color: number) => T.Material, options: { single?: boolean; centerX?: number } = {}) {
    this.single = !!options.single; this.centerX = options.centerX ?? -1.5;
    this.fabric(this.single ? 1.62 : 2.72, 2.3, color, this.centerX, .2, 1.06, .38, material);
    for (let i = 0; i < (this.single ? 1 : 2); i++) {
      const geometry = new T.SphereGeometry(.5, 12, 6); geometry.userData.generated = true;
      const pillow = new T.Mesh(geometry, material(0xfff9ed)); pillow.castShadow = true; pillow.scale.set(1, .3, .7); this.root.add(pillow); this.pillows.push(pillow);
    }
    this.update(1);
  }
  private fabric(width: number, depth: number, color: number, centerX: number, z: number, y: number, amplitude: number, material: (color: number) => T.Material) {
    const geometry = new T.PlaneGeometry(width, depth, 14, 14); geometry.rotateX(-Math.PI / 2); geometry.userData.generated = true;
    const mesh = new T.Mesh(geometry, material(color)); mesh.position.set(centerX, y, z); mesh.castShadow = true; mesh.receiveShadow = true; this.root.add(mesh);
    const clean = new Float32Array(geometry.attributes.position.array), dirty = new Float32Array(clean);
    for (let i = 0; i < clean.length; i += 3) {
      const x = clean[i], dz = clean[i + 2], pull = (depth / 2 - dz) / depth;
      dirty[i] += .22 * pull + Math.sin(dz * 3 + x * 2) * .09;
      dirty[i + 1] += amplitude * (.25 + Math.abs(Math.sin(dz * 4 + x * 1.6)) * .75) * (1 - Math.abs(x) / width * .35);
      dirty[i + 2] += pull * .55 + Math.sin(x * 3) * .08;
    }
    this.fabrics.push({ mesh, clean, dirty });
  }
  update(progress: number) {
    const tidy = Math.max(0, Math.min(1, progress)), mess = 1 - tidy;
    if (tidy === this.lastProgress) return;
    this.lastProgress = tidy;
    for (const fabric of this.fabrics) {
      const geometry = fabric.mesh.geometry, attribute = geometry.getAttribute('position');
      for (let i = 0; i < attribute.array.length; i++) attribute.array[i] = fabric.clean[i] + (fabric.dirty[i] - fabric.clean[i]) * mess;
      attribute.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    }
    this.pillows.forEach((pillow, i) => {
      const x = this.single ? this.centerX - .12 * mess : this.centerX - .54 + i * 1.08 + (i ? .18 : -.12) * mess;
      pillow.position.set(x, 1.15 + .07 * mess, -1.65 + (i ? .55 : .25) * mess); pillow.rotation.set(.12 * mess, (i ? -.45 : .32) * mess, (i ? .12 : -.09) * mess);
    });
  }
}
