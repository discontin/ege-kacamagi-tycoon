import { describe, expect, it } from 'vitest';
import { guestInWater, guestPreferences } from './GuestPreferences';
import { ResortSimulation } from './Simulation';
import { initialResort } from './data';
import { validResort } from './SaveService';
import type { GuestState } from './types';

describe('individual holiday preferences', () => {
  it('creates a reproducible mix of pool visits, drinks and activities', () => {
    const guests = Array.from({ length: 200 }, (_, i) => guestPreferences(`guest${i}`));
    for (const key of ['visitsPool', 'wantsLemonade'] as const) {
      const count = guests.filter(g => g[key]).length; expect(count).toBeGreaterThan(60); expect(count).toBeLessThan(170);
    }
    expect(new Set(guests.map(g => g.poolActivity)).size).toBe(2);
    expect(guestPreferences('guest12')).toEqual(guestPreferences('guest12'));
  });
  it('allows a hotel guest to leave without visiting the open pool', () => {
    const s = new ResortSimulation(initialResort(true), true); s.state.spawnTimer = -100;
    const room = s.facility('room1'); room.guest = 'quietGuest';
    s.state.guests = [{ id: 'quietGuest', x: 8, y: 39, phase: 'staying', remaining: .1, path: [], room: room.id, visitsPool: false }];
    s.tick(.2); expect(s.state.guests[0].phase).toBe('leaving'); expect(s.state.stats.stays).toBe(1);
  });
  it('does not generate orders for guests who do not want lemonade', () => {
    const s = new ResortSimulation(initialResort(true), true); s.state.spawnTimer = -100;
    s.state.seats[0].guest = 'resting';
    s.state.guests = [{ id: 'resting', x: 24, y: 10, phase: 'swimming', remaining: 100, path: [], seat: 'seat1', wantsLemonade: false, poolActivity: 'relax' }];
    s.tick(.5); expect(s.state.guests[0].drinkRequested).not.toBe(true); expect(s.area('drink:resting')).toBeUndefined();
  });
  it('shows swimmers in the water only during their short dip', () => {
    const g: GuestState = { id: 'swimmer', x: 24, y: 10, phase: 'swimming', remaining: 149, path: [], poolActivity: 'swim' };
    expect(guestInWater(g)).toBe(true); g.remaining = 131; expect(guestInWater(g)).toBe(false);
    g.remaining = 149; g.poolActivity = 'relax'; expect(guestInWater(g)).toBe(false);
  });
  it('preserves preferences in valid saves and rejects unknown activities', () => {
    const s = initialResort(); s.guests.push({ id: 'guest22', ...guestPreferences('guest22'), x: 19, y: 50, phase: 'queue', remaining: 0, path: [] });
    expect(validResort(s)).toBe(true); expect(validResort({ ...s, guests: [{ ...s.guests[0], poolActivity: 'invalid' }] })).toBe(false);
  });
});
