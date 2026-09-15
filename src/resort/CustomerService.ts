import { receptionQueuePoint } from './data';
import type { ResortGameState, TaskKind } from './types';

/** Serve only the front guest once they have actually stopped at the counter. */
export function serviceGuestReady(s: ResortGameState, kind: TaskKind, guestId?: string): boolean {
  if (kind !== 'checkin' && kind !== 'poolCheckin') return true;
  const front = s.guests.find(g => g.phase === (kind === 'checkin' ? 'queue' : 'poolQueue'));
  const point = kind === 'checkin' ? receptionQueuePoint(0) : { x: 21, y: 9 };
  return !!front && (!guestId || front.id === guestId) && !front.path.length && Math.hypot(front.x - point.x, front.y - point.y) <= .1;
}
