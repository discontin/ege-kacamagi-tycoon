import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { initialResort } from './data';
import { validResort } from './SaveService';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => Object.assign(s.state.player, { ...s.area(id)!, path: [] });
const setup = () => { const s = new ResortSimulation(); s.facility('pool').open = true; s.facility('pool').towels = 4; s.state.seats[0].open = true; s.state.spawnTimer = -1000; return s; };

describe('pool linen service', () => {
  it('collects a dirty towel locally and physically lays a fresh towel on the lounger', () => {
    const s = setup(); s.state.seats[0].dirty = true; stand(s, 'seat1Area'); advance(s, 4.1);
    expect(s.state.player.bag.dirty).toBe(1);
    stand(s, 'poolDirtyDrop'); advance(s, .7);
    expect(s.facility('pool').dirtyTowels).toBe(1); expect(s.state.player.bag.dirty).toBe(0);
    stand(s, 'poolCleanTake'); advance(s, .7); expect(s.state.player.bag.clean).toBe(1);
    stand(s, 'seat1Towel'); advance(s, 1.1);
    expect(s.state.seats[0].towel).toBe(true); expect(s.state.player.bag.clean).toBe(0);
  });
  it('has the pool attendant use local racks instead of walking to the laundry', () => {
    const s = setup(); s.state.seats[0].dirty = true; s.hire('pool');
    Object.assign(s.state.workers[0], { x: 24, y: 10, path: [] }); advance(s, 90);
    expect(s.state.seats[0].towel).toBe(true); expect(s.facility('pool').dirtyTowels).toBe(1);
    expect(s.state.workers[0].y).toBeLessThan(14);
  });
  it('has the room cleaner replenish the pool and take its dirty towels to laundry', () => {
    const s = setup(); s.facility('pool').towels = 0; s.facility('pool').dirtyTowels = 2;
    s.hire('rooms'); advance(s, 240);
    expect(s.facility('pool').towels).toBeGreaterThan(0);
    expect(s.facility('pool').dirtyTowels).toBe(0); expect(s.state.laundry.dirty).toBe(2); expect(s.state.stats.washed).toBe(0); expect(s.state.laundry.remaining).toBeNull();
  });
  it('admits guests opposite the desk without consuming a laid towel twice', () => {
    const s = setup(); s.facility('pool').towels = 0; s.state.seats[0].towel = true;
    s.state.guests.push({ id: 'swimmer', x: 21, y: 9, phase: 'poolQueue', remaining: 0, path: [] });
    expect(s.isWalkable(21, 7)).toBe(false); expect(s.area('poolCheckin')!.y).toBe(6);
    stand(s, 'poolCheckin'); advance(s, 3.1);
    expect(s.state.guests[0].phase).toBe('toSeat'); expect(s.facility('pool').towels).toBe(0);
    expect(s.state.seats[0].towel).toBe(false);
  });
  it('preserves new stocks and rejects invalid dirty towel counts', () => {
    const state = initialResort(); state.facilities.find(f => f.id === 'pool')!.dirtyTowels = 3;
    state.seats[0].towel = true; expect(validResort(state)).toBe(true);
    state.facilities.find(f => f.id === 'pool')!.dirtyTowels = -1; expect(validResort(state)).toBe(false);
  });
});
