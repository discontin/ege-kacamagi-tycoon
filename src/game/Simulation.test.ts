import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './data';
import { count, initialState, Simulation } from './Simulation';
import { parseSave, SaveService } from './SaveService';
import { SimulatedRewardedBoostService } from './RewardedBoostService';
import type { BuildingKind, Resource } from './types';
import { ROOMS, roomBuildings } from './facility';

function expandedSimulation() {
  const state = initialState(); state.rooms = ROOMS.map(r => r.id); state.xp = 140;
  for (const room of ROOMS.slice(1)) state.buildings.push(...roomBuildings(room, () => `b${state.nextId++}`));
  state.contract = { definitionId: 'first', remaining: 240 };
  return new Simulation(state);
}

const advance = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) sim.tick(0.1); };
function produce(sim: Simulation, kind: BuildingKind) {
  const b = sim.state.buildings.find(b => b.kind === kind)!;
  Object.assign(sim.state.player, sim.entrance(b));
  expect(sim.startJob(b.id)).toBe(true);
  advance(sim, BUILDINGS[kind].recipe!.duration + 1);
  expect(b.job).toBeUndefined();
  sim.collect(b.id);
  const depot = sim.state.buildings.find(b => b.kind === 'warehouse')!;
  Object.assign(sim.state.player, sim.entrance(depot)); sim.deposit(depot.id);
}

describe('production and the three circular chains', () => {
  it('turns waste into meals, furniture and electricity and fulfills a contract', () => {
    const sim = expandedSimulation();
    produce(sim, 'recycling'); produce(sim, 'composter'); produce(sim, 'farm'); produce(sim, 'kitchen');
    produce(sim, 'workshop'); produce(sim, 'recycling'); produce(sim, 'biogas'); produce(sim, 'generator');
    expect(sim.state.inventory.meal).toBe(2); expect(sim.state.inventory.furniture).toBe(1); expect(sim.state.inventory.electricity).toBe(3);
    const shop = sim.state.buildings.find(b => b.kind === 'shop')!; Object.assign(sim.state.player, sim.entrance(shop));
    const money = sim.state.money; sim.deliverContract(shop.id);
    expect(sim.state.completedContracts).toBe(1); expect(sim.state.money).toBe(money + 180); expect(sim.state.inventory.meal).toBe(0);
    advance(sim, 1); expect(sim.state.milestones).toBe(1);
  });
  it('reserves inputs once and prevents two actors taking the same job', () => {
    const sim = expandedSimulation(); const b = sim.state.buildings.find(b => b.kind === 'recycling')!;
    sim.state.inventory = { waste: 3 }; Object.assign(sim.state.player, sim.entrance(b));
    expect(sim.startJob(b.id)).toBe(true); expect(sim.state.inventory.waste).toBe(0);
    expect(sim.startJob(b.id, 'worker')).toBe(false); expect(sim.state.inventory.waste).toBe(0);
    expect(sim.startJob(sim.state.buildings.find(b => b.kind === 'workshop')!.id, 'worker')).toBe(false);
  });
  it('keeps full warehouse and station inventories within capacity', () => {
    const sim = expandedSimulation(); sim.state.inventory = { waste: 100 }; sim.state.player.bag = { meal: 2 };
    const depot = sim.state.buildings.find(b => b.kind === 'warehouse')!; Object.assign(sim.state.player, sim.entrance(depot)); sim.deposit(depot.id);
    expect(count(sim.state.inventory)).toBe(100); expect(sim.state.player.bag.meal).toBe(2);
    const kitchen = sim.state.buildings.find(b => b.kind === 'kitchen')!; kitchen.output = { meal: 16 }; sim.state.inventory = { vegetable: 2 }; Object.assign(sim.state.player, sim.entrance(kitchen));
    expect(sim.startJob(kitchen.id)).toBe(false); expect(sim.state.inventory.vegetable).toBe(2);
  });
  it('prevents two different stations from consuming the same organic input', () => {
    const sim = expandedSimulation(); sim.state.inventory = { organic: 2 };
    const compost = sim.state.buildings.find(b => b.kind === 'composter')!, gas = sim.state.buildings.find(b => b.kind === 'biogas')!;
    expect(sim.startJob(compost.id, 'actor-a')).toBe(true);
    expect(sim.startJob(gas.id, 'actor-b')).toBe(false);
    expect(sim.state.inventory.organic).toBe(0);
  });
  it('pauses and resumes a player job when the player leaves', () => {
    const sim = new Simulation(); const b = sim.state.buildings.find(b => b.kind === 'recycling')!; Object.assign(sim.state.player, sim.entrance(b)); sim.startJob(b.id);
    advance(sim, 2); const remaining = b.job!.remaining; sim.cancelPlayerJob(); sim.state.player.x += 2; advance(sim, 2); expect(b.job!.remaining).toBe(remaining);
    Object.assign(sim.state.player, sim.entrance(b)); advance(sim, 10); expect(sim.state.stats.produced.organic).toBe(2); expect(sim.state.player.bag.organic).toBe(2);
  });
});

describe('workers, city and timing', () => {
  it('automates waste collection, production and transport with exclusive assignment', () => {
    const sim = new Simulation(); sim.hire(); sim.hire();
    const collection = sim.state.buildings.find(b => b.kind === 'collection')!, recycling = sim.state.buildings.find(b => b.kind === 'recycling')!;
    sim.assign(sim.state.workers[0].id, collection.id); sim.assign(sim.state.workers[1].id, recycling.id);
    sim.assign(sim.state.workers[1].id, collection.id); expect(sim.state.workers[1].assignedBuilding).toBe(recycling.id);
    advance(sim, 150);
    expect(sim.state.stats.collected).toBeGreaterThan(0); expect(sim.state.stats.produced.organic).toBeGreaterThan(0); expect(sim.state.inventory.organic).toBeGreaterThan(0);
    sim.upgradeWorker(sim.state.workers[0].id); expect(sim.state.workers[0].level).toBe(2);
  });
  it('freezes timers while paused, accelerates at 2x, and clamps a boost to zero', async () => {
    const sim = new Simulation(); sim.state.boost = (await new SimulatedRewardedBoostService().requestReward())!;
    sim.state.settings.paused = true; advance(sim, 5); expect(sim.state.boost.remaining).toBe(120); expect(sim.state.elapsed).toBe(0);
    sim.state.settings.paused = false; sim.state.settings.speed = 2; advance(sim, 61); expect(sim.state.boost.remaining).toBe(0); expect(sim.multiplier).toBe(1);
    expect(sim.state.elapsed).toBeCloseTo(122);
  });
  it('rejects blocked placements and builds an affordable station on reachable empty land', () => {
    const sim = new Simulation(); expect(sim.build('kitchen', 3, 4, false)).toBe(false); expect(sim.build('farm', 21, 17, false)).toBe(false);
    expect(sim.build('collection', 3, 29, false)).toBe(true); expect(sim.state.money).toBe(590);
  });
  it('allows a purchase while standing on its entrance and charges only once', () => {
    const sim = new Simulation(); Object.assign(sim.state.player, { x: 4, y: 31 });
    expect(sim.build('collection', 3, 29, false)).toBe(true);
    expect(sim.build('collection', 3, 29, false)).toBe(false);
    expect(sim.state.money).toBe(590);
  });
  it('uses the backpack for nearby resident deliveries and grants happiness and money', () => {
    const sim = expandedSimulation(); const home = sim.state.buildings.find(b => b.kind === 'home')!; Object.assign(sim.state.player, sim.entrance(home));
    sim.state.player.bag = { meal: 1, furniture: 1, electricity: 1 }; const before = sim.happiness; sim.serveHome(home.id);
    expect(sim.state.money).toBe(723); expect(sim.happiness).toBeGreaterThan(before); expect(count(sim.state.player.bag)).toBe(0);
  });
});

describe('versioned local saves', () => {
  it('round-trips progress, buildings and reserved jobs', () => {
    const sim = new Simulation(); sim.hire(); const b = sim.state.buildings.find(b => b.kind === 'recycling')!; Object.assign(sim.state.player, sim.entrance(b)); sim.startJob(b.id); advance(sim, 2);
    const restored = parseSave(JSON.stringify(sim.state)); expect(restored).not.toBeNull(); expect(restored!.buildings.find(b => b.kind === 'recycling')!.job!.remaining).toBeCloseTo(6);
    expect(restored!.inventory.waste).toBe(6);
  });
  it.each(['not json', '{}', '{"version":2}'])('recovers safely from %s', raw => {
    const save = new SaveService({ getItem: () => raw, setItem: () => {}, removeItem: () => {} }); const loaded = save.load(); expect(loaded.recovered).toBe(true); expect(loaded.state.money).toBe(650);
  });
  it('rejects negative stock, unknown resource ids, overlaps and malformed boost timers', () => {
    const cases = [
      (s: ReturnType<typeof initialState>) => { s.inventory.waste = -3; },
      (s: ReturnType<typeof initialState>) => { s.inventory['fake' as Resource] = 1; },
      (s: ReturnType<typeof initialState>) => { s.buildings[1].x = s.buildings[0].x; },
      (s: ReturnType<typeof initialState>) => { s.boost.remaining = 121; }
    ];
    for (const modify of cases) { const s = initialState(); modify(s); expect(parseSave(JSON.stringify(s))).toBeNull(); }
  });
  it('reports a storage error rather than throwing', () => {
    const save = new SaveService({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => {} });
    expect(save.load().recovered).toBe(true); expect(save.save(initialState())).toBe(false);
  });
});
