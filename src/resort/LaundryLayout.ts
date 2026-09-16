import { DIRTY_BASKET, TOWEL_RACK } from './data';
import type { Point } from './types';
export interface LaundryFootprint extends Point { width: number; depth: number }
export const LAUNDRY_WALLS = [
  { x: 7.5, y: 42, width: 11, depth: .25, height: 1.1 },
  { x: 2, y: 45, width: .25, depth: 7.5, height: 1.1 },
  // Close the marked right edge with a full-height side wall, while the front
  // remains the intentional entrance from the reception-side walkway.
  { x: 13, y: 45, width: .25, depth: 7.5, height: 1.1 },
];
export const laundryMachines = (level: number): LaundryFootprint[] => Array.from({ length: level }, (_, i) => ({ x: 5.5 + i * 2.3, y: 45, width: 1.9, depth: 1.4 }));
export const laundryObstacles = (level: number): LaundryFootprint[] => [
  ...LAUNDRY_WALLS, ...laundryMachines(level),
  { ...TOWEL_RACK, width: 2, depth: 1 }, { ...DIRTY_BASKET, width: 1.2, depth: 1.1 },
];
export const inFootprint = (p: Point, f: LaundryFootprint) => Math.abs(p.x - f.x) <= f.width / 2 && Math.abs(p.y - f.y) <= f.depth / 2;
