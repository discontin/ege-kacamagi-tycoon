import { staffRole } from './StaffHiring';
import { DIRTY_BASKET, LAUNDRY_RIGHT_EDGE, ROOM_DEFS, TOWEL_RACK } from './data';
import type { Area, Point } from './types';

function besideShelf(p: Point, center: Point, halfWidth: number, halfDepth: number, reach: number) {
  const dx = Math.abs(p.x - center.x) - halfWidth, dy = Math.abs(p.y - center.y) - halfDepth;
  return !(dx < 0 && dy < 0) && Math.hypot(Math.max(0, dx), Math.max(0, dy)) <= reach;
}

/** Shared by automatic jobs, progress indicators and floor highlights. */
export function workAreaContains(p: Point, a: Point | Area): boolean {
  if ('mode' in a && a.taskKind === 'cleanPool') return Math.abs(p.x - a.x) <= .85 && Math.abs(p.y - a.y) <= .85;
  if ('mode' in a && a.taskKind === 'prepareDrink') return Math.abs(p.x - a.x) <= .85 && Math.abs(p.y - a.y) <= .85;
  if ('mode' in a && a.taskKind === 'deliverDrink') {
    // Reach the guest from either side or end of the visible lounger.
    return Math.hypot(Math.max(0, Math.abs(p.x - a.x) - .7), Math.max(0, Math.abs(p.y - (a.y - .6)) - 1.2)) <= 1.1;
  }
  if ('mode' in a && a.mode === 'work' && a.target === 'laundry' && ['machineLoad', 'machineUnload', 'discardItem'].includes(a.taskKind ?? '')) {
    return Math.abs(p.x - a.x) <= .7 && Math.abs(p.y - a.y) <= .7;
  }
  if ('mode' in a && !!staffRole(a.target)) return Math.abs(p.x - a.x) <= .85 && Math.abs(p.y - a.y) <= .85;
  if ('mode' in a && a.mode === 'work' && a.taskKind === 'laundryDirtyTake') {
    // Pick up from the shelf's right-hand approach side; deposits use the left
    // side so a just-deposited bundle is not immediately picked back up.
    return p.x > DIRTY_BASKET.x && besideShelf(p, DIRTY_BASKET, .6, .55, 1.35);
  }
  if ('mode' in a && a.mode === 'work' && (a.taskKind === 'cleanTake' || a.taskKind === 'dirtyDrop')) {
    const rack = a.taskKind === 'cleanTake', center = rack ? TOWEL_RACK : DIRTY_BASKET;
    if (a.taskKind === 'cleanTake' && p.x >= LAUNDRY_RIGHT_EDGE) return false;
    if (a.taskKind === 'dirtyDrop' && p.x > center.x) return false;
    // Pick up or deposit from near the shelf; don't require a marked floor tile.
    return besideShelf(p, center, rack ? 1 : .6, rack ? .5 : .55, rack ? 1.4 : 1.35);
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
