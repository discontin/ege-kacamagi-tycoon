import { describe, expect, it } from 'vitest';
import { initialResort, ROOM_APPROACH, ROOM_DEFS, ROOM_DOOR, ROOM_WORK } from './data';
import { ResortSimulation } from './Simulation';

describe('promenade-facing bungalow entrances', () => {
  it.each(ROOM_DEFS)('$id has a side doorway facing the main path and a closed front wall', r => {
    const s = new ResortSimulation(initialResort(true), true), door = ROOM_DOOR(r), approach = ROOM_APPROACH(r);
    expect(door.x).toBe(r.x < 15 ? r.x + 9 : r.x); expect(door.y).toBe(r.y + 5);
    expect(s.isWalkable(door.x, door.y)).toBe(true);
    expect(s.isWalkable(r.x + 5, r.y + 7)).toBe(false);
    expect(s.isWalkable(door.x, door.y - 1)).toBe(false);
    expect(s.isWalkable(approach.x, approach.y)).toBe(true);
    const entering = s.path({ x: 18, y: r.y + 5 }, ROOM_WORK(r));
    expect(entering).toContainEqual(door); expect(entering.every(p => s.isWalkable(p.x, p.y))).toBe(true);
    const leaving = s.path(ROOM_WORK(r), { x: 19, y: 50 });
    expect(leaving).toContainEqual(door); expect(leaving.every(p => s.isWalkable(p.x, p.y))).toBe(true);
    const purchase = new ResortSimulation().area(`${r.id}Buy`);
    if (purchase) expect({ x: purchase.x, y: purchase.y }).toEqual(approach);
  });
  it('repairs saved player, worker and guest routes through old entrances without losing inventory or jobs', () => {
    const state = initialResort(), r = ROOM_DEFS[0], oldDoor = { x: r.x + 5, y: r.y + 7 };
    state.player.x = oldDoor.x; state.player.y = oldDoor.y; state.player.bag.clean = 2;
    state.player.path = [{ x: r.x + 5, y: r.y + 8 }, { x: 19, y: 48 }];
    state.workers.push({ id: 'worker1', name: 'Deniz', role: 'rooms', level: 1, x: 18, y: 49, path: [oldDoor, ROOM_WORK(r)], bag: { clean: 1, dirty: 1 }, status: 'Temizlik', task: 'task1' });
    state.facilities.find(f => f.id === r.id)!.dirty = true;
    state.tasks.push({ id: 'task1', owner: 'worker1', target: r.id, kind: 'cleanRoom', total: 6, remaining: 3 });
    state.guests.push({ id: 'guest1', x: 18, y: 49, phase: 'toRoom', room: r.id, path: [oldDoor, ROOM_WORK(r)], remaining: 0 });
    const s = new ResortSimulation(state);
    expect(s.isWalkable(Math.round(state.player.x), Math.round(state.player.y))).toBe(true);
    for (const actor of [state.player, state.workers[0], state.guests[0]]) expect(actor.path.every(p => s.isWalkable(p.x, p.y))).toBe(true);
    expect(state.workers[0].path).toContainEqual(ROOM_DOOR(r)); expect(state.guests[0].path).toContainEqual(ROOM_DOOR(r));
    expect(state.player.bag.clean).toBe(2); expect(state.workers[0].bag).toEqual({ clean: 1, dirty: 1 }); expect(state.tasks[0].remaining).toBe(3);
  });
});
