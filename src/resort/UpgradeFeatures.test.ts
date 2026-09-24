import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { areasFor, receptionQueuePoint } from './data';
import { taskIndicators } from './TaskIndicators';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => Object.assign(s.state.player, { x: s.area(id)!.x, y: s.area(id)!.y, path: [] });

describe('feature-bearing facility upgrades', () => {
  it('makes a level-two bathroom a visible, mandatory room job with a larger tip', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.state.xp = 50; s.facility('room2').open = true; s.facility('pool').open = true; stand(s, 'room1Upgrade'); advance(s, 1.4);
    const room = s.facility('room1'); expect(room.level).toBe(2);
    s.state.guests.push({ id: 'guest20', x: 8, y: 19, path: [], phase: 'staying', room: 'room1', remaining: .1, worstWait: 0 }); room.guest = 'guest20';
    advance(s, .2); expect(room.bathroomDirty).toBe(true); expect(room.tips).toBe(16);
    const notice = taskIndicators(s.state).find(n => n.id === 'room1BathroomClean'); expect(notice?.icon).toBe('bath');
    room.dirty = false; room.floorDirty = false; room.needsSheet = false; room.towels = 1; s.facility('room2').dirty = true;
    s.state.guests.push({ id: 'waiting', ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0 }); stand(s, 'checkin'); advance(s, 4);
    expect(s.state.stats.welcomed).toBe(0);
    stand(s, 'room1Bathroom'); advance(s, 4.2); expect(room.bathroomDirty).toBe(false);
    stand(s, 'checkin'); advance(s, 3.2); expect(s.state.stats.welcomed).toBe(1);
  });

  it('unlocks room upgrades in two-room rows only after the pool opens and the previous row reaches level two', () => {
    const s = new ResortSimulation(); s.state.money = 10_000; s.state.xp = 315;
    for (let i = 2; i <= 6; i++) s.facility(`room${i}`).open = true;
    expect(areasFor(s.state).some(a => a.mode === 'upgrade' && a.target.startsWith('room'))).toBe(false);
    s.facility('pool').open = true;
    const has = (id: string) => areasFor(s.state).some(a => a.id === `${id}Upgrade`);
    expect(has('room1')).toBe(true); expect(has('room2')).toBe(true); expect(has('room3')).toBe(false);
    for (const id of ['room1', 'room2']) { stand(s, `${id}Upgrade`); advance(s, 1.4); expect(s.facility(id).level).toBe(2); }
    expect(has('room3')).toBe(true); expect(has('room4')).toBe(true); expect(has('room5')).toBe(false);
    for (const id of ['room3', 'room4']) { stand(s, `${id}Upgrade`); advance(s, 1.4); expect(s.facility(id).level).toBe(2); }
    expect(has('room5')).toBe(true); expect(has('room6')).toBe(true);
  });

  it('adds two clean loungers at pool level two and keeps the bar lemonade-only', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.state.xp = 100; const pool = s.facility('pool'); pool.open = true; pool.towels = 2;
    s.state.seats.slice(0, 4).forEach(seat => { seat.open = true; seat.towel = true; }); stand(s, 'poolUpgrade'); advance(s, 1.4);
    expect(pool.level).toBe(2); expect(s.state.seats.filter(seat => seat.open)).toHaveLength(6); expect(s.state.seats.slice(4, 6).every(seat => !seat.dirty && seat.towel)).toBe(true);
    s.state.bar!.open = true; s.state.guests.push({ id: 'guest2', x: 24, y: 10, path: [], phase: 'swimming', seat: 'seat1', remaining: 129, wantsLemonade: true });
    advance(s, .1); const guest = s.state.guests[0]; expect(guest.orderProduct).toBe('lemonade');
    stand(s, 'barPrepare'); advance(s, 2.5); expect(s.state.player.heldProduct).toBe('lemonade');
    stand(s, 'drink:guest2'); advance(s, 1); expect(guest.drinkServed).toBe(true); expect(s.state.bar!.cash).toBe(15); expect(s.message).not.toContain('Limonata teslim edildi');
    expect(taskIndicators(s.state).some(n => n.icon === 'drink')).toBe(false);
    expect(areasFor(s.state).some(area => area.id === 'poolUpgrade')).toBe(false);
  });
});
