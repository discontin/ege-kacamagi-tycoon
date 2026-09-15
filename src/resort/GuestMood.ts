import type { GuestState } from './types';
export function guestMood(guest: GuestState): '' | '😐' | '😠' {
  if (guest.phase !== 'queue' && guest.phase !== 'poolQueue') return '';
  const wait = guest.queueWait ?? 0;
  return wait >= 20 - 1e-6 ? '😠' : wait >= 10 - 1e-6 ? '😐' : '';
}
export const guestTip = (guest: GuestState) => (guest.worstWait ?? 0) >= 20 - 1e-6 ? 1 : (guest.worstWait ?? 0) >= 10 - 1e-6 ? 3 : 5;
