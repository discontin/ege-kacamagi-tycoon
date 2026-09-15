import { describe, expect, it, vi } from 'vitest';
import { createTestState, TEST_STOCK } from './TestMode';
import { Simulation, count } from './Simulation';
import { ROOMS } from './facility';
import { SaveService } from './SaveService';

describe('isolated unlimited test mode', () => {
  it('opens every room with level-1 equipment and plentiful resources', () => {
    const state = createTestState(), sim = new Simulation(state, true);
    expect(state.rooms).toEqual(ROOMS.map(r => r.id)); expect(state.buildings).toHaveLength(12);
    expect(state.buildings.every(b => b.level === 1)).toBe(true);
    expect(state.money).toBe(TEST_STOCK); expect(state.inventory.meal).toBe(TEST_STOCK);
    expect(sim.bagCapacity).toBe(Infinity); expect(sim.capacity).toBe(Infinity); expect(sim.outputCapacity).toBe(Infinity);
  });
  it('does not spend money and permits more than five employees', () => {
    const sim = new Simulation(createTestState(), true); sim.state.money = 0;
    for (let i = 0; i < 8; i++) sim.hire();
    expect(sim.state.workers).toHaveLength(8); expect(sim.state.workers.every(w => typeof w.name === 'string')).toBe(true);
    sim.upgradeWorker(sim.state.workers[0].id); expect(sim.state.workers[0].level).toBe(2);
    const b = sim.state.buildings.find(b => b.kind === 'recycling')!; Object.assign(sim.state.player, sim.entrance(b));
    sim.upgradeBuilding(b.id); expect(b.level).toBe(2); expect(sim.state.money).toBe(0);
  });
  it('ignores missing recipe inputs and a normally full output buffer', () => {
    const sim = new Simulation(createTestState(), true), b = sim.state.buildings.find(b => b.kind === 'kitchen')!;
    sim.state.inventory = {}; b.output = { meal: 100 }; Object.assign(sim.state.player, sim.entrance(b));
    expect(sim.startJob(b.id)).toBe(true); expect(sim.state.inventory).toEqual({});
    for (let i = 0; i < 100 && !sim.state.stats.produced.meal; i++) sim.tick(.1);
    expect(b.output.meal).toBe(102); expect(b.job).toBeUndefined(); expect(sim.state.inventory.vegetable).toBe(TEST_STOCK);
    sim.collect(b.id); expect(count(sim.state.player.bag)).toBe(102);
    const depot = sim.state.buildings.find(b => b.kind === 'warehouse')!; Object.assign(sim.state.player, sim.entrance(depot)); sim.deposit(depot.id);
    expect(count(sim.state.player.bag)).toBe(0); expect(sim.state.inventory.meal).toBe(TEST_STOCK + 102);
  });
  it('keeps resources, bonus and contract timers unlimited, but still pauses simulation', () => {
    const sim = new Simulation(createTestState(), true); sim.state.inventory = {}; sim.state.money = 0;
    const time = sim.state.contract.remaining;
    for (let i = 0; i < 1500; i++) sim.tick(.1);
    expect(sim.state.money).toBe(TEST_STOCK); expect(sim.state.boost.remaining).toBe(120); expect(sim.state.contract.remaining).toBe(time);
    const elapsed = sim.state.elapsed; sim.state.settings.paused = true; sim.tick(.2); expect(sim.state.elapsed).toBe(elapsed);
  });
  it('never reads or writes the normal browser save', () => {
    const storage = { getItem: vi.fn(() => 'normal progress'), setItem: vi.fn(), removeItem: vi.fn() };
    const save = new SaveService(storage, true); save.load(); expect(save.save(createTestState())).toBe(true);
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it('leaves normal game limits, timer decay and paid hiring unchanged', () => {
    const sim = new Simulation(); expect(sim.bagCapacity).toBe(12); expect(sim.outputCapacity).toBe(16); expect(sim.capacity).toBe(100);
    sim.hire(); expect(sim.state.money).toBe(550); sim.state.boost.remaining = 120; sim.tick(.2); expect(sim.state.boost.remaining).toBe(119.8);
  });
});
