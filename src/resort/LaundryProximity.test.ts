import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { CLEAN_TAKE, DIRTY_BASKET, DIRTY_DROP, initialResort, TOWEL_RACK } from './data';
import { taskIndicators } from './TaskIndicators';
import { workAreaContains } from './WorkAreas';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };

describe('laundry object proximity', () => {
  it.each([{ x: CLEAN_TAKE.x + .5, y: CLEAN_TAKE.y }, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }, { x: CLEAN_TAKE.x + .9, y: CLEAN_TAKE.y }, { x: CLEAN_TAKE.x + .9, y: CLEAN_TAKE.y - .3 }])('takes towels automatically at shelf edge %j', p => {
    const s = new ResortSimulation(); Object.assign(s.state.player, p);
    expect(s.isWalkable(p.x, p.y)).toBe(true); advance(s, 1.2);
    expect(s.state.player.bag.clean).toBe(1); expect(s.state.laundry.clean).toBe(7);
  });
  it.each([{ x: DIRTY_BASKET.x, y: DIRTY_DROP.y }, { x: DIRTY_BASKET.x - 1, y: DIRTY_BASKET.y }, { x: DIRTY_BASKET.x + .5, y: DIRTY_DROP.y }])('deposits dirty towels automatically at basket edge %j', p => {
    const s = new ResortSimulation(); Object.assign(s.state.player, p); s.state.player.bag.dirty = 2;
    expect(s.isWalkable(p.x, p.y)).toBe(true); advance(s, .8);
    expect(s.state.player.bag.dirty).toBe(0); expect(s.state.laundry.dirty + Number(s.state.laundry.remaining !== null)).toBe(2);
  });
  it('excludes object interiors and distant points, including the former clean-towel square', () => {
    const s = new ResortSimulation();
    expect(workAreaContains(TOWEL_RACK, s.area('cleanTake')!)).toBe(false);
    expect(workAreaContains(DIRTY_BASKET, s.area('dirtyDrop')!)).toBe(false);
    for (const p of [{ x: 11, y: 48 }, { x: 16, y: 46 }, { x: 7, y: 50 }]) {
      Object.assign(s.state.player, p); advance(s, 1); expect(s.state.player.bag.clean).toBe(0);
    }
  });
  it('pauses a transfer outside range and resumes the saved job at another shelf edge', () => {
    const s = new ResortSimulation(); s.facility('room1').towels = 0;
    Object.assign(s.state.player, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }); advance(s, .2);
    const task = s.state.tasks[0], remaining = task.remaining;
    expect(taskIndicators(s.state).find(n => n.id === 'laundryClean')!.state).toBe('working');
    s.state.player.x = 16; advance(s, .2); expect(task.remaining).toBe(remaining);
    expect(taskIndicators(s.state).find(n => n.id === 'laundryClean')!.state).toBe('waiting');
    const loaded = new ResortSimulation(structuredClone(s.state)); Object.assign(loaded.state.player, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }); advance(loaded, 1.2);
    expect(loaded.state.player.bag.clean).toBe(1); expect(loaded.state.laundry.clean).toBe(7);
  });
  it('preserves full bag, empty stock, full dirty shelf and exclusive transfer rules', () => {
    const s = new ResortSimulation(); Object.assign(s.state.player, { x: 14, y: 46 }); s.state.player.bag = { clean: 0, dirty: 8 };
    advance(s, 1); expect(s.state.laundry.clean).toBe(8); expect(s.state.tasks).toHaveLength(0);
    s.state.player.bag.dirty = 0; s.state.laundry.clean = 0; advance(s, 1); expect(s.state.tasks).toHaveLength(0);
    Object.assign(s.state.player, { x: 6, y: 47 }); s.state.player.bag.dirty = 1;
    s.state.laundry = { clean: 24, dirty: 24, remaining: null }; advance(s, 1); expect(s.state.player.bag.dirty).toBe(1);
    s.state.laundry.dirty = 0; s.state.xp = 20; s.hire(); s.state.workers[0].bag.dirty = 1;
    expect(s.startTask(s.area('dirtyDrop')!, s.state.workers[0].id)).toBe(true);
    expect(s.startTask(s.area('dirtyDrop')!)).toBe(false);
  });
  it('workers can transfer from the side rather than walking back to the old fixed square', () => {
    const s = new ResortSimulation(initialResort()); s.state.xp = 20; s.hire(); const w = s.state.workers[0];
    expect(s.startTask(s.area('cleanTake')!, w.id)).toBe(true); Object.assign(w, { x: CLEAN_TAKE.x + .9, y: CLEAN_TAKE.y, path: [] }); advance(s, 2);
    expect(w.bag.clean).toBe(1); expect(w.x).toBe(CLEAN_TAKE.x + .9); expect(w.y).toBe(CLEAN_TAKE.y);
  });
});
