import { staffRole } from './StaffHiring';
import { DIRTY_BASKET, ROOM_DEFS, TOWEL_RACK } from './data';
import type { Area, Point } from './types';

/** Shared by automatic jobs, progress indicators and floor highlights. */
export function workAreaContains(p: Point, a: Point | Area): boolean {
  if ('mode' in a && a.taskKind === 'cleanPool') return Math.abs(p.x - a.x) <= .85 && Math.abs(p.y - a.y) <= .85;
  if ('mode' in a && a.taskKind === 'prepareDrink') return Math.abs(p.x - a.x) <= .85 && Math.abs(p.y - a.y) <= .85;
  if ('mode' in a && a.taskKind === 'deliverDrink') {
    // Reach the guest from either side or end of the visible lounger.
    return Math.hypot(Math.max(0, Math.abs(p.x - a.x) - .7), Math.max(0, Math.abs(p.y - (a.y - .6)) - 1.2)) <= 1.1;
  }
  if ('mode' in a && !!staffRole(a.target)) return Math.abs(p.x - a.x) <= .85 && Math.abs(p.y - a.y) <= .85;
  if ('mode' in a && a.mode === 'work' && (a.taskKind === 'cleanTake' || a.taskKind === 'dirtyDrop')) {
    // Keep the pickup side separate so standing still cannot undo a transfer.
    if (a.taskKind === 'dirtyDrop' && Math.abs(p.x - (DIRTY_BASKET.x - 2)) <= .5 && Math.abs(p.y - DIRTY_BASKET.y) <= .5) return false;
    if (a.taskKind === 'cleanTake' && Math.abs(p.x - 13) <= .5 && Math.abs(p.y - 45.5) <= .5) return false;
    const rack = a.taskKind === 'cleanTake', center = rack ? TOWEL_RACK : DIRTY_BASKET;
    const dx = Math.abs(p.x - center.x) - (rack ? 1 : .6), dy = Math.abs(p.y - center.y) - (rack ? .5 : .55);
    // Work within arm's reach of any edge, never from inside the shelf/basket itself.
    return !(dx < 0 && dy < 0) && Math.hypot(Math.max(0, dx), Math.max(0, dy)) <= 1.1;
  }
  if ('mode' in a && a.mode === 'work' && (a.taskKind === 'cleanRoom' || a.taskKind === 'restockRoom')) {
    const r = ROOM_DEFS.find(r => r.id === a.target);
    if (!r) return false;
    const x = p.x - r.x, y = p.y - r.y;
    // Accessible strip around all four bed edges, not the bed or the room walls.
    const onBed = Math.round(x) >= 2 && Math.round(x) <= 4 && Math.round(y) >= 2 && Math.round(y) <= 4;
    return x >= .6 && x <= 5.4 && y >= .6 && y <= 5.8 && !onBed;
  }
  return Math.abs(p.x - a.x) <= .5 && Math.abs(p.y - a.y) <= .5;
}
