import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { initialResort, SEAT_DEFS } from './data';
import { BAR_CENTER, BAR_WORK, POOL_STAY_SECONDS, wantsDrink } from './PoolServices';
import { ResortSaveService, validResort } from './SaveService';
import { taskIndicators } from './TaskIndicators';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const setup = () => { const s = new ResortSimulation(); s.facility('pool').open = true; s.facility('pool').towels = 4; s.state.seats.slice(0, 2).forEach(r => r.open = true); s.state.spawnTimer = -100; return s; };
const stand = (s: ResortSimulation, id: string) => { const a = s.area(id)!; Object.assign(s.state.player, { x: a.x, y: a.y, path: [] }); };
const swimmer = (s: ResortSimulation, remaining = POOL_STAY_SECONDS, id = 'pool-test', seatIndex = 0) => {
  const seat = s.state.seats[seatIndex]; seat.guest = id;
  s.state.guests.push({ ...SEAT_DEFS[seatIndex], id, phase: 'swimming', seat: seat.id, remaining, path: [] });
  return s.state.guests.at(-1)!;
};

describe('pool bar and maintenance', () => {
  it('lets one pool attendant serve all four drinks, maintain the pool and clean loungers', () => {
    const s = setup(); s.state.bar!.open = true;
    s.state.seats.forEach(seat => seat.open = true); s.hire('pool');
    Object.assign(s.state.workers[0], { ...BAR_WORK, path: [] });
    const guests = Array.from({ length: 4 }, (_, i) => swimmer(s, POOL_STAY_SECONDS, `group${i}`, i));
    advance(s, 145);
    expect(guests.every(g => g.drinkServed), JSON.stringify({ guests, worker: s.state.workers[0] })).toBe(true);
    expect(s.state.bar!.cash).toBe(60); expect(s.state.workers).toHaveLength(1);
    advance(s, 220);
    expect(s.facility('pool').dirt).toBe(0);
    expect(s.state.seats.every(seat => !seat.dirty)).toBe(true);
  });
  it('keeps only one pool hire and retains old paid bar staff in another department', () => {
    const s = setup(); s.state.money = 1000; s.hire('pool'); const money = s.state.money;
    s.hire('pool'); s.hire('bartender'); expect(s.state.money).toBe(money); expect(s.state.workers).toHaveLength(1);
    const old = structuredClone(s.state.workers[0]); old.id = 'legacyBar'; old.role = 'bartender'; old.bag.dirty = 1;
    s.state.workers.push(old);
    const loaded = new ResortSimulation(s.state);
    expect(loaded.state.workers.filter(w => w.role === 'pool')).toHaveLength(1);
    expect(loaded.state.workers.find(w => w.id === 'legacyBar')?.role).toBe('hauling');
    expect(loaded.state.workers.find(w => w.id === 'legacyBar')?.bag.dirty).toBe(1);
  });
  it('places the bar behind the pool with reachable service and hiring areas', () => {
    const s = setup(); s.state.bar!.open = true;
    expect(BAR_CENTER.y).toBeLessThan(1);
    for (const id of ['barPrepare', 'barCash', 'poolStock']) {
      const a = s.area(id)!;
      expect(s.path({ x: 22, y: 8 }, a).length).toBeGreaterThan(0);
      expect(s.isWalkable(Math.round(a.x), Math.round(a.y))).toBe(true);
    }
    expect(s.isWalkable(28, 12)).toBe(true);
  });
  it('saves the player and bartender routes on the new rear bar terrace', () => {
    const s = setup(); s.state.spawnTimer = 0; s.state.bar!.open = true;
    Object.assign(s.state.player, BAR_WORK); s.hire('bartender');
    s.state.workers[0].path = s.path(s.state.workers[0], BAR_WORK);
    expect(validResort(s.state)).toBe(true);
    let raw = ''; const save = new ResortSaveService({ getItem: () => raw, setItem: (_, v) => { raw = v; } });
    save.save(s.state); expect(save.load().state).toEqual(s.state);
    s.state.player.y = -4; expect(validResort(s.state)).toBe(false);
  });
  it.each([{ x: 24, y: 8 }, { x: 22.5, y: 9.4 }, { x: 25.5, y: 9.4 }, { x: 24, y: 11.5 }])('delivers from any lounger edge %j despite overlapping maintenance', position => {
    const s = setup(); s.state.bar!.open = true; s.facility('pool').dirt = 2;
    const g = swimmer(s, 20); g.drinkRequested = true; s.state.player.drink = true;
    Object.assign(s.state.player, { ...position, path: [] }); advance(s, 1.1);
    expect(g.drinkServed).toBe(true); expect(s.state.player.drink).toBe(false);
    expect(s.state.bar!.cash).toBe(15); expect(s.facility('pool').dirt).toBe(2);
  });
  it('does not deliver from far away and pauses delivery when leaving the guest', () => {
    const s = setup(); s.state.bar!.open = true;
    const g = swimmer(s, 20); g.drinkRequested = true; s.state.player.drink = true;
    Object.assign(s.state.player, { x: 24, y: 13 }); advance(s, .5); expect(g.drinkServed).not.toBe(true);
    Object.assign(s.state.player, { x: 24, y: 11.5 }); advance(s, .4);
    const remaining = s.state.tasks[0].remaining;
    Object.assign(s.state.player, { x: 24, y: 13 }); advance(s, .5);
    expect(s.state.tasks[0].remaining).toBe(remaining); expect(s.state.player.drink).toBe(true);
    Object.assign(s.state.player, { x: 24, y: 11.5 }); advance(s, .7); expect(g.drinkServed).toBe(true);
  });
  it('applies 2x speed and boost to maintenance without advancing while paused', () => {
    const s = setup(); s.facility('pool').dirt = 4; s.state.settings.speed = 2; stand(s, 'poolClean');
    advance(s, 2); expect(s.state.tasks[0].remaining).toBeCloseTo(4);
    s.activateBoost(); s.state.settings.paused = true; advance(s, 2); expect(s.state.tasks[0].remaining).toBeCloseTo(4);
    s.state.settings.paused = false; advance(s, 1.5); expect(s.facility('pool').dirt).toBe(0);
  });
  it('recovers actors from a newly opened bar footprint on loading', () => {
    const state = initialResort(); state.bar!.open = true; Object.assign(state.player, BAR_CENTER);
    const s = new ResortSimulation(state); expect(s.isWalkable(s.state.player.x, s.state.player.y)).toBe(true);
    expect(s.path(s.state.player, BAR_WORK).length).toBeGreaterThan(0);
  });
  it('releases admission reservations when the pool becomes fully dirty mid-service', () => {
    const s = setup(); s.facility('pool').dirt = 3;
    s.state.guests = [{ id: 'waiting', x: 21, y: 9, path: [], phase: 'poolQueue', remaining: 0 }];
    stand(s, 'poolCheckin'); expect(s.startTask(s.area('poolCheckin')!)).toBe(true);
    s.facility('pool').dirt = 4; advance(s, 3.1);
    expect(s.state.guests[0].phase).toBe('poolQueue'); expect(s.state.seats.every(seat => !seat.guest)).toBe(true);
    expect(s.facility('pool').towels).toBe(4);
  });
  it('offers the bar only after opening the pool and charges 200 once', () => {
    const s = new ResortSimulation(); expect(s.area('barBuy')).toBeUndefined();
    s.facility('pool').open = true; s.state.money = 199; stand(s, 'barBuy'); advance(s, 1.4);
    expect(s.state.bar!.open).toBe(false); expect(s.state.money).toBe(199);
    s.state.player.x += 2; s.tick(.1); s.state.money = 250; stand(s, 'barBuy'); advance(s, 1.4);
    expect(s.state.bar!.open).toBe(true); expect(s.state.money).toBe(50);
    advance(s, 2); expect(s.state.money).toBe(50); expect(s.area('bartenderHire')).toBeUndefined(); expect(s.area('poolHire')).toBeDefined();
  });
  it('requests a drink after twenty seconds, prepares one visible carried item, delivers and pays once', () => {
    const s = setup(); s.state.bar!.open = true; const g = swimmer(s);
    advance(s, 19.9); expect(wantsDrink(g)).toBe(false); advance(s, .2); expect(wantsDrink(g)).toBe(true);
    expect(taskIndicators(s.state).some(i => i.id === `order:${g.id}` && i.icon === 'drink')).toBe(true);
    stand(s, 'barPrepare'); advance(s, 3.1); expect(s.state.player.drink).toBe(true);
    expect(s.state.player.bag.clean).toBe(0); expect(s.state.tasks).toHaveLength(0);
    stand(s, `drink:${g.id}`); advance(s, 1.1); expect(g.drinkServed).toBe(true);
    expect(s.state.player.drink).toBe(false); expect(s.state.bar!.cash).toBe(15);
    advance(s, 1); expect(s.state.bar!.cash).toBe(15);
    stand(s, 'barCash'); s.tick(.1); expect(s.state.money).toBe(15); expect(s.state.bar!.cash).toBe(0);
  });
  it('lets the bartender physically carry and serve an order without player intervention', () => {
    const s = setup(); s.state.bar!.open = true; s.hire('bartender');
    const w = s.state.workers[0]; Object.assign(w, { ...BAR_WORK, path: [] });
    const g = swimmer(s); let furthest = 0, carriedDrink = false;
    for (let i = 0; i < 650; i++) {
      s.tick(.1);
      furthest = Math.max(furthest, Math.hypot(w.x - BAR_WORK.x, w.y - BAR_WORK.y));
      carriedDrink ||= !!w.drink;
    }
    expect(g.drinkServed).toBe(true); expect(s.state.bar!.cash).toBe(15);
    expect(furthest).toBeGreaterThan(1); expect(carriedDrink).toBe(true);
  });
  it('reserves the single prep station and each order against competing actors', () => {
    const s = setup(); s.state.bar!.open = true; const g = swimmer(s, 20); g.drinkRequested = true;
    s.hire('bartender'); const w = s.state.workers[0];
    expect(s.startTask(s.area('barPrepare')!, w.id)).toBe(true);
    stand(s, 'barPrepare'); expect(s.startTask(s.area('barPrepare')!)).toBe(false);
    s.state.player.drink = true; stand(s, `drink:${g.id}`); expect(s.startTask(s.area(`drink:${g.id}`)!)).toBe(false);
  });
  it('cancels an expired delivery without losing the carried drink and serves the next customer', () => {
    const s = setup(); s.state.bar!.open = true; const g = swimmer(s, .1); g.drinkRequested = true; s.state.player.drink = true;
    stand(s, `drink:${g.id}`); expect(s.startTask(s.area(`drink:${g.id}`)!)).toBe(true); Object.assign(s.state.player, { x: 18, y: 15 }); s.tick(.2);
    expect(s.state.tasks).toHaveLength(0); expect(s.state.player.drink).toBe(true); expect(s.state.bar!.cash).toBe(0);
    const next = swimmer(s, 20, 'next', 1); next.drinkRequested = true; stand(s, `drink:${next.id}`); advance(s, 1.1);
    expect(next.drinkServed).toBe(true); expect(s.state.bar!.cash).toBe(15);
  });
  it('blocks new admission at four visits but lets existing guests finish', () => {
    const s = setup(); s.facility('pool').dirt = 3; swimmer(s, .1); s.tick(.2);
    expect(s.facility('pool').dirt).toBe(4);
    s.state.guests.push({ id: 'waiting', x: 21, y: 9, path: [], phase: 'poolQueue', remaining: 0 });
    stand(s, 'poolCheckin'); expect(s.startTask(s.area('poolCheckin')!)).toBe(false);
    const other = swimmer(s, .2, 'other', 1); advance(s, .3); expect(other.phase).toBe('leaving');
    expect(s.facility('pool').dirt).toBe(4);
  });
  it.each([{ x: 23, y: 5 }, { x: 34, y: 5 }, { x: 28, y: 1 }, { x: 28, y: 8 }])('does not start maintenance away from the dedicated cleaning area %j', position => {
    const s = setup(); s.facility('pool').dirt = 4; Object.assign(s.state.player, position);
    expect(s.isWalkable(position.x, position.y)).toBe(true); advance(s, 8.2);
    expect(s.facility('pool').dirt).toBe(4); expect(s.state.tasks).toHaveLength(0);
  });
  it('pauses maintenance outside range and reserves it against a second worker', () => {
    const s = setup(); s.facility('pool').dirt = 4; stand(s, 'poolClean'); advance(s, 2);
    const task = s.state.tasks[0], remaining = task.remaining; Object.assign(s.state.player, { x: 18, y: 15 }); advance(s, 1);
    expect(task.remaining).toBe(remaining); s.hire('pool'); expect(s.startTask(s.area('poolClean')!, s.state.workers[0].id)).toBe(false);
    Object.assign(s.state.player, { x: 22, y: 5 }); advance(s, 6.2); expect(s.facility('pool').dirt).toBe(0);
  });
  it('makes pool staff prioritise reopening the dirty pool', () => {
    const s = setup(); s.facility('pool').dirt = 4; s.hire('pool'); Object.assign(s.state.workers[0], { x: 22, y: 5 });
    s.tick(.1); expect(s.state.tasks[0].kind).toBe('cleanPool'); advance(s, 13); expect(s.facility('pool').dirt).toBe(0);
  });
  it('preserves a prepared drink, an order and partial maintenance across pause and save/load', () => {
    const s = setup(); s.state.spawnTimer = 0; s.state.bar!.open = true; s.state.player.drink = true;
    const g = swimmer(s, 20); g.drinkRequested = true; s.facility('pool').dirt = 4;
    stand(s, 'poolClean'); advance(s, 2); s.state.settings.paused = true; const before = structuredClone(s.state);
    advance(s, 5); expect(s.state).toEqual(before); expect(validResort(s.state), JSON.stringify(s.state)).toBe(true);
    let raw = ''; const save = new ResortSaveService({ getItem: () => raw, setItem: (_, v) => { raw = v; } }); save.save(s.state);
    const loaded = new ResortSimulation(save.load().state); expect(loaded.state).toEqual(s.state);
    loaded.state.settings.paused = false; advance(loaded, 6.2); expect(loaded.facility('pool').dirt).toBe(0);
    expect(loaded.state.player.drink).toBe(true);
  });
  it('accepts older saves and test mode opens the bar without writing normal saves', () => {
    const old = initialResort(); delete old.bar; expect(validResort(old)).toBe(true);
    expect(new ResortSimulation(old).state.bar).toEqual({ open: false, cash: 0 });
    const test = new ResortSimulation(initialResort(true), true); expect(test.state.bar!.open).toBe(true);
    let written = false; new ResortSaveService({ getItem: () => null, setItem: () => { written = true; } }, true).save(test.state);
    expect(written).toBe(false);
  });
});
