import { staffRole } from './StaffHiring';
import { DIRTY_BASKET, DIRTY_HAMPER, LAUNDRY_RIGHT_EDGE, ROOM_DEFS, TOWEL_RACK } from './data';
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
    // The rear dirty shelf is pickup-only. Deposits have their own hamper.
    return p.x > DIRTY_BASKET.x && besideShelf(p, DIRTY_BASKET, .6, .55, 1.35);
  }
  if ('mode' in a && a.mode === 'work' && a.taskKind === 'dirtyDrop') {
    // Drop from any reachable side of the hamper, never at the dirty shelf.
    return besideShelf(p, DIRTY_HAMPER, .55, .65, 1.1);
  }
  if ('mode' in a && a.mode === 'work' && a.taskKind === 'cleanTake') {
    if (p.x >= LAUNDRY_RIGHT_EDGE) return false;
    // Pick up near the clean shelf without requiring a marked floor tile.
    return besideShelf(p, TOWEL_RACK, 1, .5, 1.4);
  }
  if ('mode' in a && a.mode === 'work' && (a.taskKind === 'cleanRoom' || a.taskKind === 'restockRoom')) {
    const r = ROOM_DEFS.find(r => r.id === a.target);
    if (!r) return false;
    // Match the visible mattress instead of accepting most of the room. This is
    // especially important in right-hand bungalows, whose door is on the same
    // side as the old oversized interaction strip.
    const single = (a.facilityLevel ?? 1) === 1;
    const bedCenter = { x: r.x + (single ? 4.5 : 3), y: r.y + 3 };
    return besideShelf(p, bedCenter, single ? .9 : 1.675, single ? 1.9 : 2.075, .9);
  }
  return Math.abs(p.x - a.x) <= .5 && Math.abs(p.y - a.y) <= .5;
}
