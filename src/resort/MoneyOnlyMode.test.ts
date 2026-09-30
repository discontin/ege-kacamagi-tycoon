import { describe, expect, it } from 'vitest';
import { initialResort } from './data';
import { OFFICE } from './Office';
import { RESORT_SAVE_KEY, ResortSaveService } from './SaveService';
import { ResortSimulation } from './Simulation';

describe('unlimited money mode', () => {
  it('starts with normal progression and never reads or overwrites the normal save', () => {
    const normal = initialResort();
    normal.xp = 90;
    const saved = JSON.stringify(normal);
    const writes: string[] = [];
    const storage = {
      getItem: (key: string) => key === RESORT_SAVE_KEY ? saved : null,
      setItem: (_key: string, value: string) => { writes.push(value); },
    };
    const service = new ResortSaveService(storage, true, false);
    const loaded = service.load();
    expect(loaded.state.xp).toBe(0);
    expect(loaded.state.facilities.filter(f => f.kind === 'room' && f.open)).toHaveLength(1);
    expect(loaded.state.facilities.find(f => f.id === 'pool')?.open).toBe(false);
    expect(loaded.state.laundry.clean).toBe(8);
    expect(service.save(loaded.state)).toBe(true);
    expect(service.replaceWithNewGame(loaded.state)).toBe(true);
    expect(writes).toHaveLength(0);
    expect(storage.getItem(RESORT_SAVE_KEY)).toBe(saved);
  });

  it('ignores the cash balance but keeps level gates and finite towel stock', () => {
    const sim = new ResortSimulation(initialResort(), false, true);
    sim.state.money = 0;
    expect(sim.unlimitedMoney).toBe(true);
    expect(sim.testMode).toBe(false);
    const room = sim.area('room2Buy')!;
    Object.assign(sim.state.player, { x: room.x, y: room.y, path: [] });
    expect(sim.purchaseArea(room)).toBe(false);
    expect(sim.facility('room2').open).toBe(false);

    sim.state.xp = 15;
    expect(sim.purchaseArea(room)).toBe(true);
    expect(sim.facility('room2').open).toBe(true);
    expect(sim.state.money).toBe(0);

    Object.assign(sim.state.player, OFFICE);
    const before = sim.state.laundry.clean;
    expect(sim.buyLaundryTowels()).toBe(true);
    expect(sim.state.laundry.clean).toBe(before + 5);
    expect(sim.state.money).toBe(0);

    sim.reset();
    expect(sim.moneyOnlyMode).toBe(true);
    expect(sim.level).toBe(1);
    expect(sim.facility('room2').open).toBe(false);
  });
});
