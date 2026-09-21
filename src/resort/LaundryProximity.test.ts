import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { CLEAN_TAKE, DIRTY_BASKET, DIRTY_DROP, DIRTY_HAMPER, initialResort, TOWEL_RACK } from './data';
import { taskIndicators } from './TaskIndicators';
import { workAreaContains } from './WorkAreas';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };

describe('laundry object proximity', () => {
  it.each([{ x: CLEAN_TAKE.x + .5, y: CLEAN_TAKE.y }, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }, { x: CLEAN_TAKE.x + .9, y: CLEAN_TAKE.y }, { x: CLEAN_TAKE.x + .9, y: CLEAN_TAKE.y - .3 }])('takes towels automatically at shelf edge %j', p => {
    const s = new ResortSimulation(); Object.assign(s.state.player, p);
    expect(s.isWalkable(p.x, p.y)).toBe(true); advance(s, 2);
    expect(s.state.player.bag.clean).toBe(1); expect(s.state.laundry.clean).toBe(7);
  });
  it('collects from beside each rack without standing on the old marked squares, at a slower pace', () => {
    const dirty = new ResortSimulation(); dirty.state.laundry.dirty = 1;
    const dirtyArea = dirty.area('laundryDirtyTake')!, dirtyPosition = { x: DIRTY_BASKET.x + 1.9, y: DIRTY_BASKET.y + .7 };
    Object.assign(dirty.state.player, { ...dirtyPosition });
    expect(Math.hypot(dirtyPosition.x - dirtyArea.x, dirtyPosition.y - dirtyArea.y)).toBeGreaterThan(.5);
    expect(dirty.startTask(dirtyArea)).toBe(true);
    expect(dirty.state.tasks[0].remaining).toBe(1.2);

    const clean = new ResortSimulation(), cleanArea = clean.area('cleanTake')!, cleanPosition = { x: TOWEL_RACK.x - 1.2, y: TOWEL_RACK.y + 1.3 };
    Object.assign(clean.state.player, { ...cleanPosition });
    expect(Math.hypot(cleanPosition.x - cleanArea.x, cleanPosition.y - cleanArea.y)).toBeGreaterThan(.5);
    expect(clean.startTask(cleanArea)).toBe(true);
    expect(clean.state.tasks[0].remaining).toBe(1.8);
  });
  it('takes dirty linen one piece per completed pickup action, then continues while there is room', () => {
    const s = new ResortSimulation(); s.state.laundry.dirty = 3;
    const area = s.area('laundryDirtyTake')!;
    Object.assign(s.state.player, { x: area.x, y: area.y, path: [] });
    expect(s.startTask(area)).toBe(true); expect(s.state.tasks[0].total).toBe(1.2);
    advance(s, 1.3);
    expect(s.state.player.bag.dirty).toBe(1); expect(s.state.laundry.dirty).toBe(2);
    expect(taskIndicators(s.state).some(i => i.id === 'laundryPickup')).toBe(true);
    expect(s.startTask(area)).toBe(true);
    advance(s, 1.3);
    expect(s.state.player.bag.dirty).toBe(2); expect(s.state.laundry.dirty).toBe(1);
  });
  it('puts dirty towels and sheets in the hamper one piece per player action', () => {
    const s = new ResortSimulation(), area = s.area('dirtyDrop')!;
    s.state.player.bag = { clean: 0, dirty: 1, dirtySheets: 1 };
    Object.assign(s.state.player, { x: area.x, y: area.y, path: [] });
    expect(s.startTask(area)).toBe(true); expect(s.state.tasks[0].total).toBe(.6);
    advance(s, .8);
    expect(s.state.player.bag.dirty).toBe(0); expect(s.state.player.bag.dirtySheets).toBe(1);
    expect(s.state.laundry.dirty).toBe(1); expect(s.state.laundry.dirtySheets ?? 0).toBe(0);
    advance(s, .7);
    expect(s.state.player.bag.dirtySheets).toBe(0);
    expect(s.state.laundry.dirty).toBe(1); expect(s.state.laundry.dirtySheets).toBe(1);
  });
  it.each([{ x: DIRTY_DROP.x, y: DIRTY_DROP.y }, { x: DIRTY_HAMPER.x + 1.2, y: DIRTY_HAMPER.y + .6 }, { x: DIRTY_HAMPER.x, y: DIRTY_HAMPER.y - 1.2 }])('deposits dirty towels automatically at hamper edge %j', p => {
    const s = new ResortSimulation(); Object.assign(s.state.player, p); s.state.player.bag.dirty = 2;
    expect(s.isWalkable(p.x, p.y)).toBe(true); advance(s, 1.4);
    expect(s.state.player.bag.dirty).toBe(0); expect(s.state.laundry.dirty + Number(s.state.laundry.remaining !== null)).toBe(2);
  });
  it('does not put carried linen back onto the pickup-only dirty shelf', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirty = 1;
    Object.assign(s.state.player, { x: DIRTY_BASKET.x + 1.2, y: DIRTY_BASKET.y + .6 });
    advance(s, 1.5);
    expect(s.state.player.bag.dirty).toBe(1); expect(s.state.laundry.dirty).toBe(0);
    expect(s.state.tasks).toHaveLength(0);
  });
  it('excludes object interiors and distant points, including the former clean-towel square', () => {
    const s = new ResortSimulation();
    expect(workAreaContains(TOWEL_RACK, s.area('cleanTake')!)).toBe(false);
    expect(workAreaContains(DIRTY_BASKET, s.area('dirtyDrop')!)).toBe(false);
    expect(workAreaContains(DIRTY_HAMPER, s.area('dirtyDrop')!)).toBe(false);
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
    const loaded = new ResortSimulation(structuredClone(s.state)); Object.assign(loaded.state.player, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }); advance(loaded, 2);
    expect(loaded.state.player.bag.clean).toBe(1); expect(loaded.state.laundry.clean).toBe(7);
  });
  it('preserves full bag, empty stock, full dirty shelf and exclusive transfer rules', () => {
    const s = new ResortSimulation(); Object.assign(s.state.player, { x: 14, y: 46 }); s.state.player.bag = { clean: 0, dirty: 8 };
    advance(s, 1); expect(s.state.laundry.clean).toBe(8); expect(s.state.tasks).toHaveLength(0);
    s.state.player.bag.dirty = 0; s.state.laundry.clean = 0; advance(s, 1); expect(s.state.tasks).toHaveLength(0);
    Object.assign(s.state.player, DIRTY_DROP); s.state.player.bag.dirty = 1;
    s.state.laundry = { clean: 24, dirty: 24, remaining: null }; advance(s, 1); expect(s.state.player.bag.dirty).toBe(1);
    s.state.laundry.dirty = 0; s.state.xp = 20; s.hire(); s.state.workers[0].bag.dirty = 1;
    expect(s.startTask(s.area('dirtyDrop')!, s.state.workers[0].id)).toBe(true);
    expect(s.startTask(s.area('dirtyDrop')!)).toBe(false);
  });
  it('workers can transfer from the side rather than walking back to the old fixed square', () => {
    const s = new ResortSimulation(initialResort()); s.state.xp = 20; s.hire(); const w = s.state.workers[0];
    expect(s.startTask(s.area('cleanTake')!, w.id)).toBe(true); Object.assign(w, { x: CLEAN_TAKE.x + .9, y: CLEAN_TAKE.y, path: [] }); advance(s, 3.1);
    expect(w.bag.clean).toBe(1); expect(w.x).toBe(CLEAN_TAKE.x + .9); expect(w.y).toBe(CLEAN_TAKE.y);
  });
});
