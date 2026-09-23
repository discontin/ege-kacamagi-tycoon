import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { areasFor, initialResort, LEVELS, POOL_GATE, RECEPTION, receptionQueuePoint, ROOM_DEFS, ROOM_WORK } from './data';
import { RESORT_SAVE_KEY, ResortSaveService, validResort } from './SaveService';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => { const a = s.area(id)!; expect(a).toBeDefined(); s.state.player.path = []; Object.assign(s.state.player, { x: a.x, y: a.y }); };
const guest = (s: ResortSimulation) => { s.state.guests.push({ id: `guest${s.state.nextId++}`, ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0 }); };

describe('resort guest and towel cycle', () => {
  it('places staff behind the desk and queues customers on the opposite side', () => {
    const s = new ResortSimulation(); const staff = s.area('checkin')!;
    expect(staff.y).toBeLessThan(43); expect(s.isWalkable(staff.x, staff.y)).toBe(true);
    expect(s.path(s.state.player, staff).length).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) { const p = receptionQueuePoint(i); expect(p.y).toBeGreaterThan(44); expect(s.isWalkable(p.x, p.y)).toBe(true); }
    expect(s.isWalkable(19, 43)).toBe(false); expect(s.isWalkable(19, 44)).toBe(false);
    guest(s); Object.assign(s.state.player, receptionQueuePoint(0)); advance(s, 4); expect(s.state.stats.welcomed).toBe(0);
    stand(s, 'checkin'); advance(s, 3.2); expect(s.state.stats.welcomed).toBe(1);
  });
  it('starts with one bungalow, eight clean towels and no money', () => { const s = new ResortSimulation(); expect(s.state.money).toBe(0); expect(s.state.laundry.clean).toBe(8); expect(s.state.facilities.filter(f => f.kind === 'room' && f.open)).toHaveLength(1); });
  it('checks a guest in automatically, reserves the room and pays cash at check-in without paying again after the stay', () => {
    const s = new ResortSimulation(); guest(s); stand(s, 'checkin'); advance(s, 3.2); expect(s.state.stats.welcomed).toBe(1); expect(s.facility('room1').guest).toBeDefined(); expect(s.facility('reception').cash).toBe(40);
    advance(s, 100); expect(s.state.stats.stays).toBe(1); expect(s.facility('room1').dirty).toBe(true); expect(s.facility('reception').cash).toBe(40); expect(s.state.money).toBe(0);
    stand(s, 'receptionCash'); s.tick(.1); expect(s.state.money).toBe(40); expect(s.facility('reception').cash).toBe(0);
  });
  it('cleans, carries one dirty sheet, washes it and restocks a room', () => {
    const s = new ResortSimulation(), r = s.facility('room1'); r.dirty = true; r.towels = 0;
    stand(s, 'room1Work'); advance(s, 6.2); expect(r.dirty).toBe(false); expect(s.state.player.bag.dirty).toBe(0); expect(s.state.player.bag.dirtySheets).toBe(1); expect(r.towels).toBe(0);
    stand(s, 'dirtyDrop'); advance(s, 5.5); expect(s.state.player.bag.dirtySheets).toBe(0); expect(s.state.stats.washed).toBe(0);
    stand(s, 'laundryDirtyTake'); advance(s, 2.8); stand(s, 'machineLoad'); advance(s, 11); stand(s, 'machineUnload'); advance(s, 1.4);
    expect(s.state.stats.washed).toBe(2); expect(s.state.laundry.clean).toBe(9); expect(s.state.laundry.cleanSheets).toBe(9);
    stand(s, 'cleanTake'); advance(s, 5.2); expect(s.state.player.bag.clean).toBe(1); expect(s.state.laundry.clean).toBe(8);
    stand(s, 'room1Work'); advance(s, 3); expect(r.towels).toBe(1); expect(s.state.player.bag.clean).toBe(0);
  });
  it('does not start outside the bedside region and resumes the same reserved job on return', () => {
    const s = new ResortSimulation(), r = s.facility('room1'); r.dirty = true; r.towels = 0; stand(s, 'room1Work'); s.state.player.x += 2; advance(s, 1); expect(s.state.tasks).toHaveLength(0);
    stand(s, 'room1Work'); advance(s, 2); const remaining = s.state.tasks[0].remaining; s.state.player.x += 2; advance(s, 2); expect(s.state.tasks[0].remaining).toBe(remaining);
    stand(s, 'room1Work'); advance(s, 5); expect(r.dirty).toBe(false); expect(s.state.stats.cleaned).toBe(1);
  });
  it('blocks cleaning with a full bag and preserves outputs at a full laundry shelf', () => {
    const s = new ResortSimulation(); s.facility('room1').dirty = true; s.state.player.bag = { clean: 4, dirty: 4 }; stand(s, 'room1Work'); advance(s, 10); expect(s.facility('room1').dirty).toBe(true);
    s.state.laundry = { clean: 24, dirty: 1, remaining: 0, washingTowels: 1, washingSheets: 0 }; advance(s, 2); expect(s.state.laundry.remaining).toBe(0); expect(s.state.laundry.clean).toBe(24);
    s.state.laundry.clean--; s.tick(.1); expect(s.state.laundry.clean).toBe(23); expect(s.state.stats.washed).toBe(0);
    s.state.player.bag = { clean: 0, dirty: 0 }; stand(s, 'machineUnload'); advance(s, .7); expect(s.state.laundry.clean).toBe(24); expect(s.state.player.bag.clean).toBe(0); expect(s.state.stats.washed).toBe(1);
  });
  it('keeps early arrivals spaced out and increases demand as more rooms open', () => {
    const s = new ResortSimulation(); advance(s, 2.2); expect(s.state.guests).toHaveLength(1);
    const first = s.state.guests[0]; first.phase = 'staying'; first.room = 'room1'; first.remaining = 120; first.path = [];
    s.facility('room1').guest = first.id; s.state.stats.welcomed = 1; s.state.spawnTimer = 0;
    advance(s, 29); expect(s.state.guests).toHaveLength(1);
    advance(s, 1.2); expect(s.state.guests).toHaveLength(2);
    const second = s.state.guests.find(g => g.phase === 'queue')!;
    s.facility('room2').open = true; second.phase = 'staying'; second.room = 'room2'; second.remaining = 120; second.path = [];
    s.facility('room2').guest = second.id;
    for (const room of s.state.facilities.filter(f => f.kind === 'room' && ['room3', 'room4', 'room5', 'room6'].includes(f.id))) room.open = true;
    s.state.spawnTimer = 0; advance(s, 60);
    expect(s.state.guests.filter(g => g.phase === 'queue')).toHaveLength(4);
    expect(s.state.guests).toHaveLength(6);
  });
  it('limits the queue and total guests without penalties', () => { const s = new ResortSimulation(); advance(s, 300); expect(s.state.guests).toHaveLength(1); expect(s.state.guests.every(g => g.phase === 'queue')).toBe(true); expect(s.state.money).toBe(0); });
});

describe('pool and expansion', () => {
  it('requires level and money and purchases only once while standing still', () => {
    const s = new ResortSimulation(); s.state.money = 100; stand(s, 'room2Buy'); advance(s, 2); expect(s.facility('room2').open).toBe(false);
    s.state.player.x++; s.tick(.1); s.state.xp = 20; stand(s, 'room2Buy'); advance(s, 2); expect(s.facility('room2').open).toBe(true); expect(s.state.money).toBe(0); expect(s.facility('room2').towels).toBe(1); advance(s, 3); expect(s.state.money).toBe(0);
  });
  it('keeps the pool and its hire marker locked until all six rooms are open', () => {
    const s = new ResortSimulation(); s.state.xp = 310; s.state.money = 1000;
    expect(s.area('poolBuy')).toBeDefined(); expect(s.area('poolHire')).toBeUndefined();
    expect(s.areas.some(a => a.id.startsWith('pool') && a.id !== 'poolBuy')).toBe(false);
    expect(s.purchaseProgress(s.area('poolBuy')!)).toBeUndefined();
    const stalePoolArea = { id: 'poolBuy', label: 'Havuzu aç', mode: 'buy' as const, target: 'pool', ...POOL_GATE };
    Object.assign(s.state.player, { x: POOL_GATE.x, y: POOL_GATE.y });
    expect(s.purchaseArea(stalePoolArea)).toBe(false); expect(s.facility('pool').open).toBe(false);
    for (const id of ['room2', 'room3', 'room4', 'room5', 'room6']) s.facility(id).open = true;
    const poolArea = s.area('poolBuy')!; expect(s.requiredLevel(poolArea)).toBe(7);
    expect(s.purchaseArea(poolArea)).toBe(false); expect(s.facility('pool').open).toBe(false);
    s.state.xp = 315;
    expect(s.purchaseArea(poolArea)).toBe(true); expect(s.facility('pool').open).toBe(true);
    expect(s.area('poolHire')).toBeDefined();
    expect(s.state.seats.filter(s => s.open)).toHaveLength(4); expect(s.facility('pool').towels).toBe(2); expect(s.state.seats.filter(seat => seat.towel)).toHaveLength(4);
  });
  it('opens the pool with four seats and six towels, then serves and cleans', () => {
    const s = new ResortSimulation(); s.state.xp = 315; s.state.money = 1000;
    for (const id of ['room2', 'room3', 'room4', 'room5', 'room6']) s.facility(id).open = true;
    stand(s, 'poolBuy'); advance(s, 2); expect(s.facility('pool').open).toBe(true); expect(s.state.seats.filter(s => s.open)).toHaveLength(4); expect(s.facility('pool').towels).toBe(2); expect(s.state.seats.filter(seat => seat.towel)).toHaveLength(4);
    s.state.guests.push({ id: 'poolGuest', x: 21, y: 9, path: [], phase: 'poolQueue', remaining: 0 }); stand(s, 'poolCheckin'); advance(s, 165);
    expect(s.state.stats.poolVisits).toBe(1); expect(s.facility('pool').cash).toBe(20); expect(s.state.seats[0].dirty).toBe(true);
    stand(s, 'seat1Area'); advance(s, 4.2); expect(s.state.seats[0].dirty).toBe(false); expect(s.state.player.bag.dirty).toBe(1);
    stand(s, 'poolCash'); s.tick(.1); expect(s.facility('pool').cash).toBe(0);
  });
  it('sends a checked-out guest to the pool only when there is room', () => {
    const s = new ResortSimulation(initialResort(true), true); s.state.guests.push({ id: 'guest1', x: 8, y: 19, path: [], phase: 'staying', room: 'room1', remaining: .1 }); s.facility('room1').guest = 'guest1'; s.tick(.2); expect(s.state.guests[0].phase).toBe('toPool');
  });
  it('migrates an older open level-one pool save to the four-seat minimum', () => {
    const state = initialResort(), pool = state.facilities.find(f => f.id === 'pool')!; pool.open = true;
    state.seats.slice(0, 2).forEach(seat => { seat.open = true; seat.towel = true; });
    const s = new ResortSimulation(state);
    expect(s.state.seats.filter(seat => seat.open)).toHaveLength(4);
    expect(s.state.seats.slice(2, 4).every(seat => seat.towel)).toBe(true);
  });
  it('does not admit a pool guest without towels', () => { const s = new ResortSimulation(initialResort(true)); s.facility('pool').towels = 0; s.state.seats.forEach(seat => seat.towel = false); s.state.guests.push({ id: 'poolGuest', x: 21, y: 9, path: [], phase: 'poolQueue', remaining: 0 }); stand(s, 'poolCheckin'); advance(s, 5); expect(s.state.guests[0].phase).toBe('poolQueue'); });
  it('upgrades once per entry and charges the correct amount', () => { const s = new ResortSimulation(); s.state.money = 500; stand(s, 'receptionUpgrade'); advance(s, 4); expect(s.facility('reception').level).toBe(2); expect(s.state.money).toBe(400); s.state.player.x += 2; s.tick(.1); stand(s, 'receptionUpgrade'); advance(s, 2); expect(s.facility('reception').level).toBe(3); expect(s.state.money).toBe(200); });
  it('finds paths to every open work area and avoids walls and water', () => { const s = new ResortSimulation(initialResort(true), true); for (const a of s.areas) expect(s.path(s.state.player, a).length, a.id).toBeGreaterThan(0); expect(s.isWalkable(25, 4)).toBe(false); expect(s.isWalkable(3, 14)).toBe(false); });
});

describe('workers, reservations and time', () => {
  it('reroutes an existing reception task saved at the former front pad', () => {
    const s = new ResortSimulation(); s.state.xp = 20; s.hire(); const w = s.state.workers[0]; s.assign(w.id, 'reception'); guest(s);
    expect(s.startTask(s.area('checkin')!, w.id)).toBe(true); w.x = 19; w.y = 46; w.path = [];
    advance(s, 15); expect(s.state.stats.welcomed).toBe(1); expect(w.y).toBe(RECEPTION.y);
  });
  it('runs a complete staffed resort for ten minutes without losing towels or invalidating the save', () => {
    const s = new ResortSimulation(); s.state.xp = 280; s.state.money = 10000; s.state.facilities.forEach(f => f.open = true); s.facility('pool').towels = 4; s.state.seats.forEach(seat => seat.open = true);
    for (const role of ['reception', 'rooms', 'pool', 'hauling'] as const) { s.hire(); s.assign(s.state.workers.at(-1)!.id, role); }
    advance(s, 600); expect(s.state.stats.stays).toBeGreaterThan(5); expect(s.state.stats.poolVisits).toBeGreaterThan(2); expect(s.state.stats.washed).toBeGreaterThan(5); expect(validResort(s.state)).toBe(true);
    const towels = s.state.laundry.clean + s.state.laundry.dirty + (s.state.laundry.dirtySheets ?? 0) + (s.state.laundry.washingTowels ?? 0) + (s.state.laundry.washingSheets ?? 0) + s.state.player.bag.clean + s.state.player.bag.dirty + (s.state.player.bag.dirtySheets ?? 0) + s.state.workers.reduce((n, w) => n + w.bag.clean + w.bag.dirty + (w.bag.dirtySheets ?? 0), 0) + s.state.facilities.filter(f => f.kind === 'room').reduce((n, f) => n + f.towels + Number(f.dirty) + Number(!!f.guest && s.state.guests.some(g => g.id === f.guest && ['toRoom', 'staying'].includes(g.phase))), 0) + s.facility('pool').towels + (s.facility('pool').dirtyTowels ?? 0) + s.state.seats.filter(seat => seat.towel).length + s.state.seats.reduce((n, seat) => n + Number(seat.dirty) + Number(!!seat.guest && s.state.guests.some(g => g.id === seat.guest && ['toSeat', 'swimming'].includes(g.phase))), 0);
    expect(towels).toBe(18);
  });
  it('lets a worker carry, clean and restock without teleporting towels', () => {
    const s = new ResortSimulation(); s.state.xp = 20; s.state.money = 1000; s.hire(); s.hire('hauling'); const r = s.facility('room1'); r.dirty = true; r.towels = 0; advance(s, 160);
    expect(r.dirty).toBe(false); expect(r.needsSheet).toBe(false); expect(r.towels).toBe(1); expect(s.state.stats.cleaned).toBe(1); expect(s.state.stats.washed).toBe(2); expect(s.state.workers[0].x).not.toBe(18);
  });
  it('lets the player take over a cleaner reservation and releases it normally', () => {
    const s = new ResortSimulation(); s.state.xp = 20; s.hire(); s.facility('room1').dirty = true; const a = s.area('room1Work')!;
    expect(s.startTask(a, s.state.workers[0].id)).toBe(true); stand(s, 'room1Work'); expect(s.startTask(a)).toBe(true);
    expect(s.state.workers[0].task).toBeUndefined(); s.cancelTask(s.state.player.task!); expect(s.startTask(a)).toBe(true);
  });
  it('reserves a customer and room exclusively during check-in', () => { const s = new ResortSimulation(); guest(s); stand(s, 'checkin'); s.startTask(s.area('checkin')!); expect(s.facility('room1').guest).toBeDefined(); expect(s.facility('reception').cash).toBe(0); s.cancelTask(s.state.player.task!); expect(s.facility('room1').guest).toBeUndefined(); expect(s.state.guests[0].phase).toBe('queue'); });
  it('pauses all clocks, applies 2x and does not stack boosts', () => {
    const s = new ResortSimulation(); s.activateBoost(); advance(s, 1); expect(s.state.boost.remaining).toBeCloseTo(119); s.activateBoost(); expect(s.state.boost.remaining).toBeCloseTo(119);
    s.state.settings.paused = true; const before = JSON.stringify(s.state); advance(s, 3); expect(JSON.stringify(s.state)).toBe(before); s.state.settings.paused = false; s.state.settings.speed = 2; advance(s, 1); expect(s.state.elapsed).toBeCloseTo(3); expect(s.state.boost.remaining).toBeCloseTo(117);
  });
  it('test mode removes costs and hiring limits but retains physical bag capacity', () => { const s = new ResortSimulation(initialResort(true), true); s.state.money = 0; for (let i = 0; i < 7; i++) s.hire(); expect(s.state.workers).toHaveLength(7); expect(s.state.money).toBe(0); s.tick(.1); expect(s.state.money).toBe(999999); expect(s.bagCapacity).toBe(8); });
  it('grows player capacity, walking and work speed gently with every star level', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const s = new ResortSimulation(); s.state.xp = LEVELS[i];
      expect(s.level).toBe(i + 1);
      expect(s.bagCapacity).toBe(Math.min(8, 3 + i));
      expect(s.playerMoveSpeed).toBeCloseTo(3.2 * (1 + i * .03));
      expect(s.playerWorkEfficiency).toBeCloseTo(1 + i * .04);
    }
    const first = new ResortSimulation(), last = new ResortSimulation(); last.state.xp = LEVELS.at(-1)!;
    for (const s of [first, last]) { s.state.player.bag.dirty = 1; stand(s, 'dirtyDrop'); expect(s.startTask(s.area('dirtyDrop')!)).toBe(true); s.tick(.1); }
    expect(first.state.tasks[0].remaining).toBeCloseTo(.5);
    expect(last.state.tasks[0].remaining).toBeCloseTo(.6 - .1 * last.playerWorkEfficiency);
  });
});

describe('isolated resort saves', () => {
  it('round-trips guests, tasks, towels and cash without touching the previous game key', () => {
    const entries = new Map([['copten-sehre-save-v1', 'OLD GAME']]), store = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v); } };
    const s = new ResortSimulation(); guest(s); stand(s, 'checkin'); advance(s, 1); s.facility('reception').cash = 10;
    const save = new ResortSaveService(store); expect(validResort(s.state)).toBe(true); expect(save.save(s.state)).toBe(true); expect(save.load().state).toEqual(s.state); expect(entries.get('copten-sehre-save-v1')).toBe('OLD GAME'); expect(entries.has(RESORT_SAVE_KEY)).toBe(true);
  });
  it('migrates removed pool level three and old ice-cream orders in existing saves', () => {
    const legacy: any = JSON.parse(JSON.stringify(initialResort()));
    legacy.facilities.find((f: any) => f.id === 'pool').level = 3;
    legacy.player.drink = true; legacy.player.heldProduct = 'icecream';
    legacy.guests.push({ id: 'legacyGuest', ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0, orderProduct: 'icecream' });
    const save = new ResortSaveService({ getItem: () => JSON.stringify(legacy), setItem: () => {} });
    const loaded = save.load();
    expect(loaded.recovered).toBe(false); expect(loaded.state.facilities.find(f => f.id === 'pool')?.level).toBe(2);
    expect(loaded.state.player.heldProduct).toBe('lemonade'); expect(loaded.state.guests[0].orderProduct).toBe('lemonade');
  });
  it.each(['not json', '{}', '{"version":2}'])('recovers safely from %s', raw => { const save = new ResortSaveService({ getItem: () => raw, setItem: () => {} }); expect(save.load().recovered).toBe(true); expect(save.load().state).toEqual(initialResort()); });
  it('rejects invalid coordinates, unknown roles, negative stock and orphan tasks', () => { for (const edit of [(v: any) => v.player.x = 999, (v: any) => v.laundry.clean = -1, (v: any) => v.player.task = 'missing']) { const s = initialResort(); edit(s); expect(validResort(s)).toBe(false); } });
  it('never reads or writes saves in test mode', () => { let reads = 0, writes = 0; const save = new ResortSaveService({ getItem: () => { reads++; return '{}'; }, setItem: () => { writes++; } }, true); expect(save.load().state.facilities.every(f => f.open)).toBe(true); expect(save.save(initialResort(true))).toBe(true); expect(reads).toBe(0); expect(writes).toBe(0); });
});
