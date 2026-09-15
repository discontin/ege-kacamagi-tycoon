import { DIRTY_BASKET, TOWEL_RACK } from './data';
import type { Point } from './types';
export interface LaundryFootprint extends Point { width: number; depth: number }
export const LAUNDRY_WALLS = [
  { x: 8.5, y: 43, width: 11, depth: .25, height: 2 },
  { x: 3, y: 45, width: .25, depth: 4.25, height: 1.1 },
  // Keep the reception-facing side open instead of enclosing the walkway.
  { x: 14, y: 43.5, width: .25, depth: 1.25, height: .65 },
];
export const laundryMachines = (level: number): LaundryFootprint[] => Array.from({ length: level }, (_, i) => ({ x: 5.5 + i * 2.3, y: 45, width: 1.9, depth: 1.4 }));
export const laundryObstacles = (level: number): LaundryFootprint[] => [
  ...LAUNDRY_WALLS, ...laundryMachines(level),
  { ...TOWEL_RACK, width: 2, depth: 1 }, { ...DIRTY_BASKET, width: 1.2, depth: 1.1 },
];
export const inFootprint = (p: Point, f: LaundryFootprint) => Math.abs(p.x - f.x) <= f.width / 2 && Math.abs(p.y - f.y) <= f.depth / 2;
