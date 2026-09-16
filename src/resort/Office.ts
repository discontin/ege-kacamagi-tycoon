import type { PlayerState, WorkerState, Point } from './types';
export const OFFICE = { x: 30, y: 48 };
export const workerMoveSpeed = (w: WorkerState) => 1.7 + (w.role === 'reception' ? 0 : ((w.moveLevel ?? 1) - 1) * .35);
export const atOffice = (p: Point) => Math.hypot(p.x - OFFICE.x, p.y - OFFICE.y) <= 1.2;
export const carryingCapacity = (a: PlayerState | WorkerState) => 'role' in a ? 8 + 4 * ((a.carryLevel ?? 1) - 1) : 8;
export const towelLimit = (a: PlayerState | WorkerState) => 'role' in a ? a.carryLevel ?? 1 : 2;
