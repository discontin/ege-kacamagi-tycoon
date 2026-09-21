import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { validResort } from './SaveService';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const setup = () => { const s = new ResortSimulation(); s.state.spawnTimer = -1000; s.state.money = 1000; s.hire('hauling'); return s; };
describe('staffed laundry and pool delivery', () => {
  it('lets laundry staff return washed items in test mode even when the infinite shelf is at its display cap', () => {
    const s = new ResortSimulation(undefined, true); s.state.spawnTimer = -1000; s.hire('hauling');
    s.state.laundry.remaining = 0; s.state.laundry.washingTowels = 1; s.state.laundry.washingSheets = 0;
    advance(s, 60);
    const w = s.state.workers[0];
    expect(s.state.laundry.clean).toBe(999);
    expect(w.bag.clean).toBe(0); expect(w.carryingWashed).toBeFalsy();
    expect(s.state.stats.washed).toBe(1);
  });

  it('carries dirty stock to the machine and unloads washed output directly to the clean shelf', () => {
    const s = setup(); s.state.laundry.dirty = 1; s.state.laundry.dirtySheets = 1;
    let carriedDirty = false;
    for (let i = 0; i < 1200; i++) {
      s.tick(.1); const w = s.state.workers[0];
      carriedDirty ||= w.bag.dirty > 0 || (w.bag.dirtySheets ?? 0) > 0;
    }
    expect(carriedDirty).toBe(true);
    expect(s.state.laundry.clean).toBe(10); expect(s.state.laundry.cleanSheets).toBe(9);
    expect(s.state.stats.washed).toBe(3); expect(s.state.workers[0].bag.clean).toBe(0); expect(s.state.workers[0].carryingWashed).toBeFalsy();
    s.state.spawnTimer = 0; expect(validResort(s.state)).toBe(true);
  });
  it('collects pool dirty towels and supplies its clean shelf', () => {
    const s = setup(); s.facility('pool').open = true; s.facility('pool').dirtyTowels = 2; s.facility('pool').towels = 0;
    advance(s, 800);
    expect(s.facility('pool').dirtyTowels).toBe(0); expect(s.state.stats.washed).toBe(2); expect(s.facility('pool').towels).toBe(4);
  });
  it('keeps room cleaners on room jobs when laundry staff handles pool stock', () => {
    const s = setup(); s.hire('rooms'); s.facility('pool').open = true; s.facility('pool').dirtyTowels = 1;
    s.tick(.1); const w = s.state.workers.find(w => w.role === 'rooms')!;
    const t = s.state.tasks.find(t => t.owner === w.id);
    expect(t?.kind).not.toBe('poolDirtyTake'); expect(t?.kind).not.toBe('poolStock');
  });
  it('does not teleport dirty shelf stock into the machine when staffed', () => {
    const s = setup(); s.state.laundry.dirty = 1; s.state.settings.paused = true; advance(s, 5);
    expect(s.state.laundry.dirty).toBe(1); expect(s.state.laundry.remaining).toBeNull();
    s.state.settings.paused = false; s.tick(.1);
    expect(s.state.laundry.remaining).toBeNull(); expect(s.state.laundry.dirty).toBe(1); expect(s.state.tasks[0].kind).toBe('laundryDirtyTake');
  });
});
