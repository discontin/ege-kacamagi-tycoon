import type { GuestState } from './types';
import { POOL_STAY_SECONDS } from './PoolServices';

function roll(id: string, salt: string) {
  let hash = 2166136261;
  for (const c of `${id}:${salt}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100;
}
export const guestPreferences = (id: string) => ({
  visitsPool: roll(id, 'pool') < 70,
  wantsLemonade: roll(id, 'drink') < 50,
  poolActivity: roll(id, 'activity') < 55 ? 'swim' as const : 'relax' as const,
});
// Swimmers take a short dip, then return to their reserved lounger for service.
export const guestInWater = (g: GuestState) => g.phase === 'swimming' && g.poolActivity === 'swim' && g.remaining > POOL_STAY_SECONDS - 18;
