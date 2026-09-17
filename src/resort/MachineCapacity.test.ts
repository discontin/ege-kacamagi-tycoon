import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { towelLimit } from './Office';
import { validResort } from './SaveService';
import { LAUNDRY_MACHINE_AREA } from './data';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
describe('machine batches and towel limits', () => {
  it('starts with room for five mixed items and unloads the full batch onto the clean rack', () => {
    const s = new ResortSimulation(); s.state.player.bag = { clean:0, dirty:3, dirtySheets:2 };
    Object.assign(s.state.player, { ...LAUNDRY_MACHINE_AREA }); advance(s,.7);
    expect(s.machineCapacity).toBe(5); expect(s.state.laundry.washingTowels).toBe(3); expect(s.state.laundry.washingSheets).toBe(2);
    expect(s.state.player.bag.dirty).toBe(0); expect(s.state.player.bag.dirtySheets).toBe(0);
    Object.assign(s.state.player, { x:19, y:48 }); advance(s,11);
    expect(s.state.laundry.remaining).toBe(0); expect(s.state.laundry.clean).toBe(8); expect(validResort(s.state)).toBe(true);
    Object.assign(s.state.player, { ...LAUNDRY_MACHINE_AREA }); advance(s,2.1);
    expect(s.state.player.bag.clean).toBe(0); expect(s.state.player.bag.cleanSheets ?? 0).toBe(0);
    expect(s.state.laundry.clean).toBe(11); expect(s.state.laundry.cleanSheets).toBe(10); expect(s.state.stats.washed).toBe(5);
    expect(s.state.laundry.remaining).toBeNull();
  });
  it('charges for capacity at the reachable machine-side area', () => {
    const s = new ResortSimulation(); s.state.money=1000; const a=s.area('laundryUpgrade')!;
    expect(s.isWalkable(a.x,a.y)).toBe(true); Object.assign(s.state.player,{x:a.x,y:a.y});
    advance(s,1.4); expect(s.machineCapacity).toBe(7); expect(s.state.money).toBe(880);
    s.state.player.y=49; s.tick(.1); Object.assign(s.state.player,{x:a.x,y:a.y}); advance(s,1.4);
    expect(s.machineCapacity).toBe(9); expect(s.state.money).toBe(640);
  });
  it('limits the player to two towels and freshly hired staff to one, with office growth', () => {
    const s = new ResortSimulation(); s.hire('rooms'); const w=s.state.workers[0];
    expect(towelLimit(s.state.player)).toBe(2); expect(towelLimit(w)).toBe(1);
    w.carryLevel=2; expect(towelLimit(w)).toBe(2); w.carryLevel=3; expect(towelLimit(w)).toBe(3);
  });
});
