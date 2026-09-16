import * as T from 'three';
import { describe, expect, it } from 'vitest';
import { BedLinen } from './BedLinen';
const bedding = () => new BedLinen(0x80b8d9, color => new T.MeshStandardMaterial({ color }));
const cloth = (bed: BedLinen) => bed.root.children[0] as T.Mesh;
const positions = (bed: BedLinen) => Array.from(cloth(bed).geometry.attributes.position.array);
describe('recognizably unmade bed', () => {
  it('uses one colored linen layer and pillows, not a duplicate white top sheet', () => { const bed = bedding(); expect(bed.root.children).toHaveLength(3); expect((cloth(bed).material as T.MeshStandardMaterial).color.getHex()).toBe(0x80b8d9); expect(bed.root.children.every(c => c instanceof T.Mesh && c.position.y > .9)).toBe(true); });
  it('wrinkles and pulls the fabric while displacing the pillows', () => { const bed = bedding(), clean = positions(bed), pillow = bed.root.children[1].position.clone(); bed.update(0); const messy = positions(bed); expect(messy).not.toEqual(clean); expect(Math.max(...messy.filter((_, i) => i % 3 === 1))).toBeGreaterThan(.25); expect(bed.root.children[1].position.equals(pillow)).toBe(false); expect(bed.root.children[1].rotation.y).not.toBe(0); });
  it('smooths linen gradually and restores the exact original layout', () => { const bed = bedding(), clean = positions(bed); bed.update(0); const messy = positions(bed); bed.update(.5); const half = positions(bed); for (let i = 0; i < half.length; i++) expect(half[i]).toBeCloseTo((clean[i] + messy[i]) / 2, 5); bed.update(1); expect(positions(bed)).toEqual(clean); expect(bed.root.children[1].rotation.y).toBe(0); });
  it('keeps progress bounded, uses no new geometry per update and marks generated geometry for disposal', () => { const bed = bedding(), geometry = cloth(bed).geometry; bed.update(-1); const messy = positions(bed); bed.update(0); expect(positions(bed)).toEqual(messy); bed.update(3); expect(cloth(bed).geometry).toBe(geometry); expect(bed.root.children.every(c => (c as T.Mesh).geometry.userData.generated)).toBe(true); });
  it('builds one colored linen layer and one centered pillow for a single bed', () => { const bed = new BedLinen(0x80b8d9, color => new T.MeshStandardMaterial({ color }), { single: true, centerX: 0 }); expect(bed.root.children).toHaveLength(2); expect(bed.root.children.every(c => Math.abs(c.position.x) < .2)).toBe(true); });
});
