import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { receptionQueuePoint } from './data';
import { taskIndicators } from './TaskIndicators';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => Object.assign(s.state.player, { x: s.area(id)!.x, y: s.area(id)!.y, path: [] });

describe('feature-bearing facility upgrades', () => {
  it('makes a level-two bathroom a visible, mandatory room job with a larger tip', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.state.xp = 50; s.facility('room2').open = true; stand(s, 'room1Upgrade'); advance(s, 1.4);
    const room = s.facility('room1'); expect(room.level).toBe(2);
    s.state.guests.push({ id: 'guest20', x: 8, y: 19, path: [], phase: 'staying', room: 'room1', remaining: .1, worstWait: 0 }); room.guest = 'guest20';
    advance(s, .2); expect(room.bathroomDirty).toBe(true); expect(room.tips).toBe(8);
    const notice = taskIndicators(s.state).find(n => n.id === 'room1BathroomClean'); expect(notice?.icon).toBe('bath');
    room.dirty = false; room.floorDirty = false; room.needsSheet = false; room.towels = 1; s.facility('room2').dirty = true;
    s.state.guests.push({ id: 'waiting', ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0 }); stand(s, 'checkin'); advance(s, 4);
    expect(s.state.stats.welcomed).toBe(0);
    stand(s, 'room1Bathroom'); advance(s, 4.2); expect(room.bathroomDirty).toBe(false);
    stand(s, 'checkin'); advance(s, 3.2); expect(s.state.stats.welcomed).toBe(1);
  });

  it('opens two clean loungers and ice-cream orders at pool level two', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.state.xp = 100; const pool = s.facility('pool'); pool.open = true; pool.towels = 2;
    s.state.seats.slice(0, 2).forEach(seat => { seat.open = true; seat.towel = true; }); stand(s, 'poolUpgrade'); advance(s, 1.4);
    expect(pool.level).toBe(2); expect(s.state.seats.filter(seat => seat.open)).toHaveLength(4); expect(s.state.seats.slice(2, 4).every(seat => !seat.dirty && seat.towel)).toBe(true);
    s.state.bar!.open = true; s.state.guests.push({ id: 'guest2', x: 24, y: 10, path: [], phase: 'swimming', seat: 'seat1', remaining: 129, wantsLemonade: true });
    advance(s, .1); const guest = s.state.guests[0]; expect(guest.orderProduct).toBe('icecream');
    stand(s, 'barPrepare'); advance(s, 2.5); expect(s.state.player.heldProduct).toBe('icecream');
    stand(s, 'drink:guest2'); advance(s, 1); expect(guest.drinkServed).toBe(true); expect(s.state.bar!.cash).toBe(22);
    expect(taskIndicators(s.state).some(n => n.icon === 'icecream')).toBe(false);
  });
});
