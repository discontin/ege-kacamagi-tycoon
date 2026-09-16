import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { OFFICE, carryingCapacity, workerMoveSpeed } from './Office';
import { ROOM_DEFS } from './data';
import { validResort } from './SaveService';

describe('staff upgrade office', () => {
  it('gives reception only service upgrades and does not charge for movement or carrying', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.hire('reception');
    const w = s.state.workers[0]; Object.assign(s.state.player, OFFICE); const money = s.state.money;
    s.upgradeCarry(w.id); s.upgradeMove(w.id);
    expect(s.state.money).toBe(money); expect(carryingCapacity(w)).toBe(8);
    s.upgradeWorker(w.id); expect(w.level).toBe(2); expect(workerMoveSpeed(w)).toBe(1.7);
  });
  it('separates task efficiency from walking speed for other staff', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.hire('rooms'); const w = s.state.workers[0];
    Object.assign(s.state.player, OFFICE); const speed = workerMoveSpeed(w);
    s.upgradeWorker(w.id); expect(workerMoveSpeed(w)).toBe(speed); expect(w.level).toBe(2);
    s.upgradeMove(w.id); expect(workerMoveSpeed(w)).toBeGreaterThan(speed); expect(w.level).toBe(2);
    s.state.spawnTimer = -100; s.facility('room1').dirty = true;
    Object.assign(w, { x: ROOM_DEFS[0].x + 5, y: ROOM_DEFS[0].y + 5, path: [] }); s.tick(.1);
    expect(s.state.tasks.find(t => t.owner === w.id)!.remaining).toBeCloseTo(6 - .1 * .8);
  });
  it('is reachable through its side entrance and upgrades require being at the office', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.hire(); const w = s.state.workers[0], money = s.state.money;
    expect(s.path(s.state.player, OFFICE).length).toBeGreaterThan(0);
    s.upgradeCarry(w.id); s.upgradeWorker(w.id); expect(w.level).toBe(1); expect(carryingCapacity(w)).toBe(8);
    Object.assign(s.state.player, OFFICE); s.upgradeCarry(w.id); s.upgradeWorker(w.id);
    expect(w.level).toBe(2); expect(carryingCapacity(w)).toBe(12); expect(s.state.money).toBe(money - 220);
    s.upgradeCarry(w.id); expect(carryingCapacity(w)).toBe(16);
    const after = s.state.money; s.upgradeCarry(w.id); expect(s.state.money).toBe(after);
  });
  it('permits upgraded bags in saves without enlarging the player bag', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.hire(); const w = s.state.workers[0];
    w.carryLevel = 3; w.bag.dirty = 16; expect(validResort(s.state)).toBe(true);
    w.bag.dirty = 17; expect(validResort(s.state)).toBe(false);
    w.bag.dirty = 16; s.state.player.bag.dirty = 9; expect(validResort(s.state)).toBe(false);
  });
  it('increases actual dirty stock pickup and freezes upgrades while paused', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.hire('hauling'); const w = s.state.workers[0];
    Object.assign(s.state.player, OFFICE); s.upgradeCarry(w.id); s.upgradeCarry(w.id);
    s.state.laundry.dirty = 16; Object.assign(w, { x: s.area('laundryDirtyTake')!.x, y: s.area('laundryDirtyTake')!.y, path: [] });
    for (let i = 0; i < 10; i++) s.tick(.1);
    expect(w.bag.dirty).toBe(3);
    s.state.settings.paused = true; s.upgradeWorker(w.id); expect(w.level).toBe(1);
  });
});
