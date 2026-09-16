import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { taskIndicators } from './TaskIndicators';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => Object.assign(s.state.player, { x: s.area(id)!.x, y: s.area(id)!.y, path: [] });

describe('laundry requires physical handling without staff', () => {
  it.each([1, 2] as const)('leaves dirty towels and sheets on the shelf at %sx speed', speed => {
    const s = new ResortSimulation(); s.state.settings.speed = speed;
    s.state.laundry.dirty = 2; s.state.laundry.dirtySheets = 1;
    advance(s, 60);
    expect(s.state.laundry.dirty).toBe(2); expect(s.state.laundry.dirtySheets).toBe(1);
    expect(s.state.laundry.remaining).toBeNull(); expect(s.state.laundry.clean).toBe(8);
    expect(s.state.laundry.cleanSheets).toBe(8); expect(s.state.stats.washed).toBe(0);
    expect(taskIndicators(s.state).some(i => i.areaId === 'laundryDirtyTake')).toBe(true);
  });
  it('finishes a loaded machine but leaves the output there until collected', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirty = 1;
    stand(s, 'machineLoad'); advance(s, .7);
    Object.assign(s.state.player, { x: 19, y: 48 }); advance(s, 30);
    expect(s.state.laundry.remaining).toBe(0); expect(s.state.laundry.clean).toBe(8);
    expect(s.state.stats.washed).toBe(0);
    expect(taskIndicators(s.state).find(i => i.areaId === 'machineUnload')?.state).toBe('todo');
    stand(s, 'machineUnload'); advance(s, .7);
    Object.assign(s.state.player, { x: 19, y: 48 }); advance(s, 10);
    expect(s.state.player.bag.clean).toBe(1); expect(s.state.player.carryingWashed).toBe(true);
    expect(s.state.laundry.clean).toBe(8);
    stand(s, 'laundryCleanDrop'); advance(s, 10);
    expect(s.state.player.bag.clean).toBe(0); expect(s.state.laundry.clean).toBe(9);
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
    stand(s, 'dirtyDrop'); advance(s, .8);
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
