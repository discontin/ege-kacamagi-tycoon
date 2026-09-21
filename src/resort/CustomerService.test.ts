import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { initialResort, RECEPTION, receptionQueuePoint } from './data';
import { serviceGuestReady } from './CustomerService';
import { taskIndicators } from './TaskIndicators';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
describe('customer must reach the counter before service', () => {
  it('does not start player check-in or reserve a room for an approaching guest', () => {
    const s = new ResortSimulation(); Object.assign(s.state.player, RECEPTION);
    s.state.guests.push({ id: 'guest1', x: 19, y: 50, path: [], phase: 'queue', remaining: 0 });
    expect(s.startTask(s.area('checkin')!)).toBe(false); advance(s, 1);
    expect(s.state.tasks).toHaveLength(0); expect(s.facility('room1').guest).toBeUndefined();
    advance(s, 1.2); expect(s.state.tasks).toHaveLength(1); expect(s.state.tasks[0].remaining).toBeGreaterThan(2.5);
    advance(s, 3); expect(s.state.stats.welcomed).toBe(1); expect(s.state.xp).toBe(10);
  });
  it('does not start worker check-in while the customer is still walking', () => {
    const s = new ResortSimulation(); s.state.xp = 15; s.hire(); const w = s.state.workers[0]; s.assign(w.id, 'reception'); Object.assign(w, RECEPTION);
    s.state.guests.push({ id: 'guest1', x: 19, y: 50, path: [], phase: 'queue', remaining: 0 }); advance(s, 1);
    expect(w.task).toBeUndefined(); advance(s, 1.2); expect(w.task).toBeDefined(); expect(s.state.tasks[0].remaining).toBeGreaterThan(2.7);
  });
  it('freezes a loaded partial task and its green working icon until the guest arrives', () => {
    const s = new ResortSimulation(); Object.assign(s.state.player, RECEPTION);
    s.state.guests.push({ id: 'guest1', ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0 }); s.startTask(s.area('checkin')!);
    const t = s.state.tasks[0]; t.remaining = 2; s.state.guests[0].y = 50; s.state.guests[0].path = [{ x: 19, y: 46 }];
    advance(s, 1); expect(t.remaining).toBe(2); expect(s.isTaskActive(t)).toBe(false);
    expect(taskIndicators(s.state).find(n => n.id === 'receptionGuest')?.state).toBe('waiting');
    advance(s, 1.1); expect(t.remaining).toBeLessThan(2);
  });
  it('does not serve a later customer ahead of the first customer', () => {
    const s = initialResort(); s.guests.push({ id: 'first', x: 19, y: 49, path: [], phase: 'queue', remaining: 0 }, { id: 'second', ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0 });
    expect(serviceGuestReady(s, 'checkin')).toBe(false); s.guests[0].y = 46;
    expect(serviceGuestReady(s, 'checkin', 'second')).toBe(false); expect(serviceGuestReady(s, 'checkin', 'first')).toBe(true);
    s.guests[0].path = [{ x: 19, y: 46 }]; expect(serviceGuestReady(s, 'checkin')).toBe(false);
  });
  it('applies the arrival rule at the pool entrance as well', () => {
    const s = new ResortSimulation(initialResort(true), true); Object.assign(s.state.player, s.area('poolCheckin'));
    s.state.guests.push({ id: 'poolGuest', x: 21, y: 11, path: [], phase: 'poolQueue', remaining: 0 });
    expect(s.startTask(s.area('poolCheckin')!)).toBe(false); advance(s, .5); expect(s.state.tasks).toHaveLength(0);
    advance(s, .7); expect(s.state.tasks).toHaveLength(1); expect(s.state.tasks[0].remaining).toBeGreaterThan(2.5);
  });
});
