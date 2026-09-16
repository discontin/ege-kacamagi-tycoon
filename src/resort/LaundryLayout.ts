import { DIRTY_BASKET, LAUNDRY_MACHINE, LAUNDRY_RIGHT_EDGE, TOWEL_RACK } from './data';
import type { Point } from './types';
export interface LaundryFootprint extends Point { width: number; depth: number }
export const LAUNDRY_WALLS = [
  { x: 6.75, y: 42, width: 9.5, depth: .25, height: 1.1 },
  { x: 2, y: 45, width: .25, depth: 7.5, height: 1.1 },
  // The right side is the new entrance: split the wall around a wide door.
  { x: LAUNDRY_RIGHT_EDGE, y: 42.75, width: .25, depth: 2.5, height: 1.1 },
  { x: LAUNDRY_RIGHT_EDGE, y: 47.25, width: .25, depth: 2.5, height: 1.1 },
  // Close the whole lower/front edge; the room is entered from the side only.
  { x: 6.75, y: 48.75, width: 9.5, depth: .25, height: 1.1 },
];
export const laundryMachines = (level: number): LaundryFootprint[] => Array.from({ length: level }, (_, i) => ({ x: LAUNDRY_MACHINE.x + i * 2.3, y: LAUNDRY_MACHINE.y, width: 1.9, depth: 1.4 }));
export const laundryObstacles = (level: number): LaundryFootprint[] => [
  ...LAUNDRY_WALLS, ...laundryMachines(level),
  { ...TOWEL_RACK, width: 2, depth: 1 }, { ...DIRTY_BASKET, width: 1.2, depth: 1.1 },
];
export const inFootprint = (p: Point, f: LaundryFootprint) => Math.abs(p.x - f.x) <= f.width / 2 && Math.abs(p.y - f.y) <= f.depth / 2;
