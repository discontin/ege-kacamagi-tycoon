import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { guestMood } from './GuestMood';
import { receptionQueuePoint, ROOM_DEFS, ROOM_WORK } from './data';
import { validResort, ResortSaveService } from './SaveService';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const queue = (s: ResortSimulation, pool = false) => {
  s.state.spawnTimer = -100;
  s.state.guests = [{ id: 'guest-test', ...(pool ? { x: 18, y: 8 } : receptionQueuePoint(0)), path: [], phase: pool ? 'poolQueue' : 'queue', remaining: 0 }];
  return s.state.guests[0];
};
const checkout = (s: ResortSimulation, wait: number) => {
  const r = ROOM_DEFS[0]; s.state.spawnTimer = -100;
  s.state.guests = [{ id: 'guest-test', ...ROOM_WORK(r), path: [], phase: 'staying', remaining: .1, room: r.id, worstWait: wait }];
  s.facility(r.id).guest = 'guest-test'; s.tick(.2);
};

describe('guest patience and room tips', () => {
  it.each([false, true])('shows patience thresholds in the queue (pool=%s), without guests escaping', pool => {
    const s = new ResortSimulation(), g = queue(s, pool);
    advance(s, 9.9); expect(guestMood(g)).toBe('');
    advance(s, .1); expect(guestMood(g)).toBe('😐');
    advance(s, 10); expect(guestMood(g)).toBe('😠');
    advance(s, 30); expect(s.state.guests).toContain(g);
  });
  it('freezes patience when paused and applies 2x simulation speed', () => {
    const s = new ResortSimulation(), g = queue(s); s.state.settings.speed = 2;
    advance(s, 5); expect(guestMood(g)).toBe('😐');
    s.state.settings.paused = true; const wait = g.queueWait; advance(s, 20);
    expect(g.queueWait).toBe(wait);
  });
  it('hides the emoji and resets the current queue timer after admission', () => {
    const s = new ResortSimulation(), g = queue(s); g.queueWait = 20; g.worstWait = 20;
    Object.assign(s.state.player, s.area('checkin')!); advance(s, 3.2);
    expect(guestMood(g)).toBe(''); expect(g.queueWait).toBe(0); expect(g.worstWait).toBeGreaterThanOrEqual(20);
  });
  it.each([[0, 5], [10, 3], [20, 1]])('leaves %i-second-wait tips of %i on checkout, and collects only once', (wait, amount) => {
    const s = new ResortSimulation(); checkout(s, wait);
    expect(s.facility('room1').tips).toBe(amount); expect(s.state.money).toBe(150);
    Object.assign(s.state.player, { x: ROOM_DEFS[0].x + 6, y: ROOM_DEFS[0].y + 2 }); s.tick(.1);
    expect(s.state.money).toBe(150 + amount); expect(s.facility('room1').tips).toBe(0);
    advance(s, 1); expect(s.state.money).toBe(150 + amount);
  });
  it('accumulates uncollected tips and workers cannot collect them', () => {
    const s = new ResortSimulation(); checkout(s, 0); checkout(s, 10);
    s.state.xp = 20; s.hire(); Object.assign(s.state.workers[0], { x: 9, y: 36 });
    advance(s, 1); expect(s.facility('room1').tips).toBe(8);
  });
  it('preserves patience and tips in saves, accepts older saves and rejects invalid new values', () => {
    const s = new ResortSimulation(); expect(validResort(s.state)).toBe(true);
    queue(s); s.state.spawnTimer = 0; s.state.guests[0].queueWait = 15; s.state.guests[0].worstWait = 15; s.facility('room1').tips = 8;
    let raw = ''; const save = new ResortSaveService({ getItem: () => raw, setItem: (_, v) => { raw = v; } });
    save.save(s.state); expect(save.load().state).toEqual(s.state);
    s.state.guests[0].queueWait = -1; expect(validResort(s.state)).toBe(false);
    s.state.guests[0].queueWait = 15; s.facility('room1').tips = 1.5; expect(validResort(s.state)).toBe(false);
  });
});
