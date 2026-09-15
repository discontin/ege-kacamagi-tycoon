import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { receptionQueuePoint } from './data';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation) => { const a = s.area('receptionHire')!; Object.assign(s.state.player, { x: a.x, y: a.y, path: [] }); };

describe('reception hiring pad', () => {
  it('takes its place behind the desk even without guests or a ready room', () => {
    const s = new ResortSimulation(); s.hire('reception'); s.facility('room1').dirty = true;
    s.state.spawnTimer = -100; advance(s, 12);
    const w = s.state.workers[0]; expect(s.inside(w, s.area('checkin')!)).toBe(true);
    expect(w.path).toHaveLength(0); expect(w.status).toBe('Hazır oda bekleniyor');
    s.facility('room1').dirty = false;
    s.state.guests = [{ id: 'ready-guest', ...receptionQueuePoint(0), phase: 'queue', path: [], remaining: 0 }];
    advance(s, 5); expect(s.state.stats.welcomed).toBe(1);
  });
  it('takes over check-in when the player left a partially reserved customer', () => {
    const s = new ResortSimulation(); s.state.spawnTimer = -100;
    s.state.guests = [{ id: 'reserved-guest', ...receptionQueuePoint(0), phase: 'queue', path: [], remaining: 0 }];
    Object.assign(s.state.player, s.area('checkin')!); expect(s.startTask(s.area('checkin')!)).toBe(true);
    Object.assign(s.state.player, { x: 24, y: 42 }); s.hire('reception'); advance(s, 15);
    expect(s.state.stats.welcomed).toBe(1); expect(s.state.player.task).toBeUndefined();
    expect(s.facility('reception').cash).toBe(40);
  });
  it('hires when standing near the displayed marker rather than exactly at its centre', () => {
    const s = new ResortSimulation(); s.state.money = 200; stand(s); s.state.player.x += .7; s.state.player.y += .6;
    advance(s, 1.4); expect(s.state.workers).toHaveLength(1); expect(s.state.money).toBe(0);
  });
  it('retries a failed hire when funds become available without leaving the pad', () => {
    const s = new ResortSimulation(); stand(s); s.state.money = 199; advance(s, 2);
    expect(s.state.workers).toHaveLength(0); s.state.money = 200; advance(s, .3);
    expect(s.state.workers).toHaveLength(1); expect(s.state.money).toBe(0);
  });
  it('hires one receptionist for money at level one, without repeated charges', () => {
    const s = new ResortSimulation(); s.state.money = 200; stand(s); advance(s, 1.4);
    expect(s.state.workers).toHaveLength(1); expect(s.state.workers[0].role).toBe('reception');
    expect(s.state.money).toBe(0); expect(s.area('receptionHire')).toBeUndefined();
    advance(s, 10); expect(s.state.workers).toHaveLength(1); expect(s.state.money).toBe(0);
  });
  it('requires money and being inside the pad, and respects pause', () => {
    const s = new ResortSimulation(), a = s.area('receptionHire')!;
    expect(s.purchaseArea(a)).toBe(false); stand(s); s.state.money = 199; advance(s, 2);
    expect(s.state.workers).toHaveLength(0); expect(s.state.money).toBe(199);
    s.state.player.y++; s.tick(.1); stand(s); s.state.money = 200; s.state.settings.paused = true;
    advance(s, 2); expect(s.state.workers).toHaveLength(0);
    s.state.settings.paused = false; advance(s, 1.4); expect(s.state.workers).toHaveLength(1);
  });
  it('walks behind the desk, admits the guest and leaves money immediately', () => {
    const s = new ResortSimulation(); s.state.money = 200; stand(s); advance(s, 1.4);
    s.state.guests = [{ id: 'guest-service', ...receptionQueuePoint(0), phase: 'queue', path: [], remaining: 0 }];
    s.state.spawnTimer = -100; advance(s, 15);
    expect(s.state.stats.welcomed).toBe(1); expect(s.facility('reception').cash).toBe(40);
    expect(s.state.money).toBe(0);
  });
});
