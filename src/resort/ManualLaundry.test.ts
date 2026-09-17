import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { taskIndicators } from './TaskIndicators';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => Object.assign(s.state.player, { x: s.area(id)!.x, y: s.area(id)!.y, path: [] });

describe('manual laundry workflow', () => {
  it.each([1, 2] as const)('leaves dirty towels and sheets on the shelf at %sx speed', speed => {
    const s = new ResortSimulation(); s.state.settings.speed = speed;
    s.state.laundry.dirty = 2; s.state.laundry.dirtySheets = 1;
    advance(s, 60);
    expect(s.state.laundry.dirty).toBe(2); expect(s.state.laundry.dirtySheets).toBe(1);
    expect(s.state.laundry.remaining).toBeNull(); expect(s.state.laundry.clean).toBe(8);
    expect(s.state.laundry.cleanSheets).toBe(8); expect(s.state.stats.washed).toBe(0);
    expect(taskIndicators(s.state).some(i => i.areaId === 'laundryDirtyTake')).toBe(true);
  });
  it('adds washed output to the clean shelf when the machine is unloaded', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirty = 1;
    stand(s, 'machineLoad'); advance(s, .7);
    Object.assign(s.state.player, { x: 19, y: 48 }); advance(s, 30);
    expect(s.state.laundry.remaining).toBe(0); expect(s.state.laundry.clean).toBe(8);
    expect(s.state.stats.washed).toBe(0);
    expect(taskIndicators(s.state).find(i => i.areaId === 'machineUnload')?.state).toBe('todo');
    stand(s, 'machineUnload'); advance(s, .7);
    Object.assign(s.state.player, { x: 19, y: 48 }); advance(s, 10);
    expect(s.state.player.bag.clean).toBe(0); expect(s.state.player.carryingWashed).toBeFalsy();
    expect(s.state.laundry.clean).toBe(9); expect(s.state.stats.washed).toBe(1);
    expect(s.area('laundryCleanDrop')).toBeUndefined();
    expect(taskIndicators(s.state).some(i => i.id === 'laundryPutClean')).toBe(false);
  });
  it('runs a normal-level wash cycle for ten seconds', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirty = 1;
    stand(s, 'machineLoad'); advance(s, .7);
    expect(s.state.laundry.remaining).toBeGreaterThan(9.5);
    Object.assign(s.state.player, { x: 19, y: 48 }); advance(s, 9);
    expect(s.state.laundry.remaining).toBeGreaterThan(0);
    advance(s, 1); expect(s.state.laundry.remaining).toBe(0);
  });
  it('moves washed linen from an older saved clean-drop task onto the rack', () => {
    const old = new ResortSimulation();
    old.state.player.bag.clean = 1; old.state.player.carryingWashed = true; old.state.player.task = 'legacy-drop';
    old.state.tasks.push({ id: 'legacy-drop', kind: 'laundryCleanDrop', target: 'laundry', owner: 'player', remaining: .2, total: .6 });
    const loaded = new ResortSimulation(old.state);
    expect(loaded.state.laundry.clean).toBe(9); expect(loaded.state.player.bag.clean).toBe(0);
    expect(loaded.state.player.carryingWashed).toBe(false); expect(loaded.state.tasks).toHaveLength(0);
  });
  it('does not take deposited linen back or redeposit picked-up linen while standing still', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirty = 2;
    stand(s, 'dirtyDrop'); advance(s, 10);
    expect(s.state.player.bag.dirty).toBe(0); expect(s.state.laundry.dirty).toBe(2);
    stand(s, 'laundryDirtyTake'); advance(s, 10);
    expect(s.state.player.bag.dirty).toBe(2); expect(s.state.laundry.dirty).toBe(0);
    expect(s.state.laundry.remaining).toBeNull();
  });
  it('routes the player to the clear pickup side of the dirty rack, then lets them load the washer', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirty = 2;
    stand(s, 'dirtyDrop'); advance(s, 1.4);
    expect(s.state.laundry.dirty).toBe(2);
    const pickup = s.area('laundryDirtyTake')!;
    expect(s.isWalkable(Math.round(pickup.x), Math.round(pickup.y))).toBe(true);
    expect(s.path(s.state.player, pickup).length).toBeGreaterThan(0);
    expect(taskIndicators(s.state).some(i => i.id === 'laundryPickup')).toBe(true);
    s.goToArea('laundryDirtyTake'); advance(s, 8);
    expect(s.state.player.bag.dirty).toBe(2); expect(s.state.laundry.dirty).toBe(0);
    stand(s, 'machineLoad'); advance(s, .8);
    expect(s.state.player.bag.dirty).toBe(0); expect(s.state.laundry.washingTowels).toBe(2);
    expect(s.state.laundry.remaining).toBeGreaterThan(0);
  });
});
