import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => Object.assign(s.state.player, { x: s.area(id)!.x, y: s.area(id)!.y, path: [] });
const setup = () => { const s = new ResortSimulation(); s.state.spawnTimer = -1000; return s; };

describe('switching between field jobs', () => {
  it('lets the player take a cleaning task away from an assigned cleaner', () => {
    const s = setup(); s.hire('rooms'); const worker = s.state.workers[0];
    s.facility('room1').dirty = true;
    expect(s.startTask(s.area('room1Work')!, worker.id)).toBe(true);
    stand(s, 'room1Work'); s.tick(.1);
    expect(s.state.player.task).toBeDefined();
    expect(worker.task).toBeUndefined();
    expect(s.state.tasks.filter(t => t.target === 'room1')).toHaveLength(1);
    expect(s.state.tasks.find(t => t.target === 'room1')?.owner).toBe('player');
  });

  it('sends the cleaner to another room after the player takes over', () => {
    const s = setup(); s.hire('rooms'); const worker = s.state.workers[0];
    s.facility('room1').dirty = true; s.facility('room2').open = true; s.facility('room2').dirty = true;
    expect(s.startTask(s.area('room1Work')!, worker.id)).toBe(true);
    stand(s, 'room1Work'); s.tick(.1);
    expect(s.state.tasks.find(t => t.owner === worker.id)?.target).toBe('room2');
  });

  it('lets a paused floor task yield to bedside cleaning', () => {
    const s = setup(); const room = s.facility('room1'); room.dirty = true; room.floorDirty = true;
    stand(s, 'room1Floor'); advance(s, .5); const old = s.state.player.task;
    stand(s, 'room1Work'); advance(s, 6.1);
    expect(room.dirty).toBe(false); expect(room.floorDirty).toBe(true);
    expect(s.state.tasks.some(t => t.id === old)).toBe(false); expect(s.state.player.bag.dirtySheets).toBe(1);
  });
  it('lets a paused room task yield to pool admission', () => {
    const s = setup(); s.facility('room1').dirty = true; stand(s, 'room1Work'); advance(s, .5);
    s.facility('pool').open = true; s.facility('pool').towels = 2; s.state.seats[0].open = true;
    s.state.guests.push({ id: 'poolGuest', x: 21, y: 9, path: [], phase: 'poolQueue', remaining: 0 });
    stand(s, 'poolCheckin'); advance(s, 3.1);
    expect(s.state.guests[0].phase).toBe('toSeat'); expect(s.facility('room1').dirty).toBe(true);
    expect(s.state.tasks.some(t => t.target === 'room1')).toBe(false);
  });
  it('keeps partial work when leaving without starting a different job', () => {
    const s = setup(); s.facility('room1').dirty = true; stand(s, 'room1Work'); advance(s, 1);
    const t = s.state.tasks[0], remaining = t.remaining;
    Object.assign(s.state.player, { x: 18, y: 30 }); advance(s, 1);
    expect(t.remaining).toBe(remaining); stand(s, 'room1Work'); advance(s, 5.1);
    expect(s.facility('room1').dirty).toBe(false);
  });
  it('opens the pool with four clean loungers and six towels split between seats and shelf', () => {
    const s = setup(); s.state.xp = 315; s.state.money = 400;
    for (const id of ['room2', 'room3', 'room4', 'room5', 'room6']) s.facility(id).open = true;
    stand(s, 'poolBuy'); advance(s, 1.4);
    const seats = s.state.seats.filter(seat => seat.open);
    expect(seats).toHaveLength(4); expect(seats.every(seat => !seat.dirty && seat.towel)).toBe(true);
    expect(s.facility('pool').towels + seats.filter(seat => seat.towel).length).toBe(6);
    expect(s.areas.some(a => a.taskKind === 'restockSeat')).toBe(false);
  });
});
