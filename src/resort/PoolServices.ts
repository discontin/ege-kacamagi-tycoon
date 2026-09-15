import type { GuestState, Point } from './types';
export const BAR_CENTER = { x: 28.5, y: -1 };
export const BAR_WORK = { x: 28.5, y: -3 };
export const BAR_CASH = { x: 25, y: -1 };
export const BAR_HIRE = { x: 32, y: -1 };
export const POOL_TOWEL_RACK = { x: 34.5, y: 0 };
export const POOL_DIRTY_RACK = { x: 34.5, y: 3 };
export const poolTowelRack = (level: number): Point => level >= 2 ? { x: 37, y: 0 } : POOL_TOWEL_RACK;
export const poolDirtyRack = (level: number): Point => level >= 2 ? { x: 37, y: 3 } : POOL_DIRTY_RACK;
export const POOL_STAY_SECONDS = 150;
export const DRINK_REQUEST_DELAY = 20;
export const insideBar = (p: Point) => Math.abs(p.x - BAR_CENTER.x) <= 2.1 && Math.abs(p.y - BAR_CENTER.y) <= 1.025;
export const POOL_CLEAN = { x: 22, y: 5 };
export const wantsDrink = (g: GuestState) => g.phase === 'swimming' && !!g.drinkRequested && !g.drinkServed;
export const atPoolEdge = (p: Point) => {
  const inside = p.x >= 24 && p.x <= 33 && p.y >= 2 && p.y <= 7;
  return !inside && Math.hypot(Math.max(24 - p.x, 0, p.x - 33), Math.max(2 - p.y, 0, p.y - 7)) <= 2;
};
