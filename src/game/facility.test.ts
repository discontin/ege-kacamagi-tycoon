import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './data';
import { initialState, Simulation } from './Simulation';
import { parseSave, SaveService } from './SaveService';
import { ROOMS, ROOM_IDS } from './facility';

const advance = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) sim.tick(.1); };
function open(sim: Simulation, id: string) { const r = ROOMS.find(r => r.id === id)!; Object.assign(sim.state.player, r.gate); expect(sim.unlockRoom(id)).toBe(true); }

describe('room-based tycoon progression', () => {
  it('starts with a lobby and one work room, not all three production chains', () => {
    const sim = new Simulation();
    expect(sim.state.rooms).toEqual(['recycling']);
    expect(sim.state.buildings.map(b => b.kind)).toEqual(['collection', 'recycling', 'warehouse', 'shop']);
    expect(sim.level).toBe(1); expect(sim.contract.id).toBe('sorting');
    sim.state.buildings.forEach(b => expect(sim.path(sim.state.player, sim.entrance(b)).length).toBeGreaterThan(0));
  });
  it('blocks walls, locked interiors, and placements in corridors or the wrong room', () => {
    const sim = new Simulation();
    expect(sim.isWalkable(13, 27)).toBe(false); expect(sim.isWalkable(13, 28)).toBe(true);
    expect(sim.isWalkable(24, 27)).toBe(false); expect(sim.path(sim.state.player, { x: 24, y: 27 })).toEqual([]);
    expect(sim.build('collection', 15, 25, false)).toBe(false);
    expect(sim.build('kitchen', 6, 29, false)).toBe(false);
    expect(sim.build('collection', 13, 28, false)).toBe(false);
  });
  it('requires experience, prerequisites, proximity, and money to unlock a room', () => {
    const sim = new Simulation(), garden = ROOMS.find(r => r.id === 'garden')!;
    Object.assign(sim.state.player, garden.gate); expect(sim.unlockRoom('garden')).toBe(false);
    sim.state.xp = 15; sim.state.money = 99; expect(sim.unlockRoom('garden')).toBe(false);
    sim.state.money = 650; Object.assign(sim.state.player, { x: 16, y: 34 }); expect(sim.unlockRoom('garden')).toBe(false);
    expect(sim.state.money).toBe(650); open(sim, 'garden'); expect(sim.state.money).toBe(550);
    expect(sim.state.buildings.filter(b => b.kind === 'farm')).toHaveLength(1);
    expect(sim.unlockRoom('garden')).toBe(false); expect(sim.state.money).toBe(550);
    expect(sim.isWalkable(8, 19)).toBe(true);
    sim.state.xp = 140; expect(sim.roomUnlockable('energy')).toBe(false);
  });
  it('keeps all newly opened equipment reachable by player and workers', () => {
    const sim = new Simulation(); sim.state.xp = 220; sim.state.money = 3000;
    for (const id of ['garden', 'kitchen', 'workshop', 'energy', 'community']) open(sim, id);
    expect(sim.state.rooms).toHaveLength(6);
    sim.hire(); sim.state.buildings.forEach(b => {
      expect(sim.path({ x: 16, y: 34 }, sim.entrance(b)).length, b.kind).toBeGreaterThan(0);
      expect(sim.path(sim.state.workers[0], sim.entrance(b)).length, b.kind).toBeGreaterThan(0);
    });
    expect(parseSave(JSON.stringify(sim.state))).not.toBeNull();
  });
  it('awards repeatable early income and XP, then accepts a lobby order', () => {
    const sim = new Simulation(), recycling = sim.state.buildings.find(b => b.kind === 'recycling')!;
    for (let i = 0; i < 3; i++) { Object.assign(sim.state.player, sim.entrance(recycling)); sim.startJob(recycling.id); advance(sim, 9); sim.collect(recycling.id); const depot = sim.state.buildings.find(b => b.kind === 'warehouse')!; Object.assign(sim.state.player, sim.entrance(depot)); sim.deposit(depot.id); }
    expect(sim.level).toBe(2); expect(sim.state.money).toBe(686);
    const counter = sim.state.buildings.find(b => b.kind === 'shop')!; Object.assign(sim.state.player, sim.entrance(counter)); sim.deliverContract(counter.id);
    expect(sim.state.money).toBe(776); expect(sim.state.xp).toBe(35); expect(sim.contract.id).toBe('sorting');
  });
  it('does not purchase or upgrade while paused and never upgrades remotely', () => {
    const sim = new Simulation(); sim.state.xp = 140; sim.state.settings.paused = true;
    Object.assign(sim.state.player, ROOMS[1].gate); expect(sim.unlockRoom('garden')).toBe(false);
    const b = sim.state.buildings[1]; sim.upgradeBuilding(b.id); expect(b.level).toBe(1);
    sim.state.settings.paused = false; sim.upgradeBuilding(b.id); expect(b.level).toBe(1); expect(sim.state.money).toBe(650);
    Object.assign(sim.state.player, sim.entrance(b)); sim.upgradeBuilding(b.id); expect(b.level).toBe(2); expect(sim.state.money).toBe(533);
  });
});

function legacySave() {
  const state = initialState(), raw: any = structuredClone(state);
  delete raw.layout; delete raw.rooms; delete raw.xp;
  const placements = [['collection', 3, 4], ['recycling', 6, 4], ['composter', 9, 4], ['farm', 12, 4], ['warehouse', 8, 9], ['kitchen', 12, 9], ['workshop', 16, 9], ['biogas', 16, 4], ['generator', 16, 13], ['home', 3, 10], ['home', 3, 13], ['shop', 8, 13]] as const;
  raw.buildings = placements.map(([kind, x, y], i) => ({ id: `b${i}`, kind, x, y, rotated: false, level: i === 1 ? 2 : 1, output: {} }));
  raw.player.x = 10; raw.player.y = 12; raw.inventory = { organic: 4, fiber: 2, metal: 2 }; raw.money = 370;
  raw.workers = [{ id: 'w20', name: 'Deniz', level: 2, x: 9, y: 11, phase: 'idle', carrying: {}, path: [], assignedBuilding: 'b1' }]; raw.nextId = 21;
  return raw;
}
describe('facility save compatibility', () => {
  it('migrates the old yard, preserving stations, levels, staff, stock and money', () => {
    const old = legacySave(), parsed = parseSave(JSON.stringify(old))!;
    expect(parsed).not.toBeNull(); expect(parsed.rooms).toEqual(ROOM_IDS); expect(parsed.buildings).toHaveLength(12);
    expect(parsed.money).toBe(370); expect(parsed.inventory).toEqual(old.inventory);
    expect(parsed.workers[0].assignedBuilding).toBe('b1'); expect(parsed.workers[0].level).toBe(2);
    expect(parsed.buildings[1].level).toBe(2); expect(parsed.player.x).toBe(16);
    expect(parseSave(JSON.stringify(parsed))).not.toBeNull();
  });
  it('backs up the original yard before its migrated state is saved', () => {
    const raw = JSON.stringify(legacySave()), writes = new Map<string, string>();
    const service = new SaveService({ getItem: () => raw, setItem: (key, value) => { writes.set(key, value); }, removeItem: () => {} });
    expect(service.load().existing).toBe(true); expect(service.migrated).toBe(true);
    expect(writes.get('copten-sehre-yard-backup-v1')).toBe(raw);
  });
  it('rejects tampered room IDs, prerequisites and locked-room equipment', () => {
    const bad = initialState(); bad.rooms.push('fake'); expect(parseSave(JSON.stringify(bad))).toBeNull();
    const skipped = initialState(); skipped.rooms.push('energy'); expect(parseSave(JSON.stringify(skipped))).toBeNull();
    const b = initialState(); b.buildings.push({ id: 'illegal', kind: 'kitchen', x: 24, y: 26, rotated: false, level: 1, output: {} });
    expect(parseSave(JSON.stringify(b))).toBeNull();
  });
});
