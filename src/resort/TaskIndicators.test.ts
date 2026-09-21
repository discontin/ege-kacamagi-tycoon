import { describe, expect, it } from 'vitest';
import { areasFor, DIRTY_BASKET, DIRTY_DROP, initialResort, ROOM_WORK, ROOM_DEFS } from './data';
import { taskIndicators, taskIconSvg } from './TaskIndicators';

describe('floating task notices', () => {
  it('does not mark a clean, stocked room as needing work', () => { expect(taskIndicators(initialResort()).some(n => n.id.startsWith('room'))).toBe(false); });
  it('shows the clean-linen pickup hint only while the player is taking clean linen', () => {
    const s = initialResort();
    expect(taskIndicators(s).some(n => n.id === 'laundryClean')).toBe(false);
    Object.assign(s.player, { x: 10.2, y: 44 });
    s.tasks.push({ id: 'take-clean', owner: 'player', target: 'laundry', kind: 'cleanTake', total: 3, remaining: 3 });
    expect(taskIndicators(s).find(n => n.id === 'laundryClean')?.icon).toBe('towel');
    s.tasks = [];
    expect(taskIndicators(s).some(n => n.id === 'laundryClean')).toBe(false);
  });
  it('marks the dirty bed with a cleaning icon linked to the real room work square', () => {
    const s = initialResort(), r = s.facilities.find(f => f.id === 'room1')!; r.dirty = true; r.towels = 0;
    const n = taskIndicators(s).find(n => n.id === 'room1Clean')!;
    expect(n.icon).toBe('bed'); expect(n.areaId).toBe('room1Work'); expect(n.height).toBeGreaterThan(1); expect(n.x).toBe(ROOM_DEFS[0].x + 3);
    expect(taskIndicators(s).some(n => n.id === 'room1Towel')).toBe(false);
  });
  it('replaces cleaning with a towel icon, then removes it when restocked', () => {
    const s = initialResort(), r = s.facilities.find(f => f.id === 'room1')!; r.dirty = true; r.towels = 0;
    expect(taskIndicators(s).some(n => n.icon === 'bed')).toBe(true); r.dirty = false;
    expect(taskIndicators(s).find(n => n.id === 'room1Towel')?.icon).toBe('towel'); expect(taskIndicators(s).some(n => n.icon === 'bed')).toBe(false);
    r.towels = 1; expect(taskIndicators(s).some(n => n.id.startsWith('room'))).toBe(false);
  });
  it('does not mark locked or occupied rooms', () => {
    const s = initialResort(); s.facilities.find(f => f.id === 'room2')!.dirty = true; const r = s.facilities.find(f => f.id === 'room1')!; r.dirty = true; r.guest = 'guest1';
    expect(taskIndicators(s).some(n => n.id.startsWith('room'))).toBe(false);
  });
  it('shows active progress only while the actor is in the actual square', () => {
    const s = initialResort(), r = s.facilities.find(f => f.id === 'room1')!; r.dirty = true; r.towels = 0;
    Object.assign(s.player, ROOM_WORK(ROOM_DEFS[0])); s.tasks.push({ id: 't1', owner: 'player', target: 'room1', kind: 'cleanRoom', total: 6, remaining: 3 });
    let n = taskIndicators(s).find(n => n.id === 'room1Clean')!; expect(n.state).toBe('working'); expect(n.progress).toBe(.5);
    s.player.x += 2; n = taskIndicators(s).find(n => n.id === 'room1Clean')!; expect(n.state).toBe('waiting'); expect(n.progress).toBe(.5);
    s.player.x -= 2; s.settings.paused = true; expect(taskIndicators(s).find(n => n.id === 'room1Clean')!.state).toBe('waiting');
  });
  it('marks dirty loungers and an understocked pool shelf', () => {
    const s = initialResort(true); s.seats[0].dirty = true; s.facilities.find(f => f.id === 'pool')!.towels = 0;
    const ns = taskIndicators(s); expect(ns.find(n => n.id === 'seat1Clean')!.areaId).toBe('seat1Area'); expect(ns.find(n => n.id === 'poolTowels')!.icon).toBe('towel');
    s.seats[0].dirty = false; expect(taskIndicators(s).some(n => n.id === 'seat1Clean')).toBe(false);
  });
  it('marks laundry deposit, clean pickup and automatic washing distinctly', () => {
    const s = initialResort(); s.player.bag.dirty = 1; s.facilities.find(f => f.id === 'room1')!.towels = 0; s.laundry.dirty = 2; s.laundry.remaining = 2;
    s.tasks.push({ id: 'take-clean', owner: 'player', target: 'laundry', kind: 'cleanTake', total: 3, remaining: 3 });
    const ns = taskIndicators(s), deposit = ns.find(n => n.id === 'laundryDirty')!, pickup = ns.find(n => n.id === 'laundryPickup')!;
    expect(deposit.icon).toBe('dirty'); expect(deposit.x).toBe(DIRTY_DROP.x); expect(deposit.y).toBe(DIRTY_DROP.y);
    expect(pickup.x).toBe(DIRTY_BASKET.x); expect(pickup.y).toBe(DIRTY_BASKET.y);
    expect(Math.hypot(deposit.x - pickup.x, deposit.y - pickup.y)).toBeGreaterThan(1);
    expect(ns.find(n => n.id === 'laundryClean')!.icon).toBe('towel'); expect(ns.find(n => n.id === 'laundryWash')!.state).toBe('working');
  });
  it('marks waiting guests only when check-in can use a ready room', () => {
    const s = initialResort(); s.guests.push({ id: 'g1', x: 19, y: 46, path: [], phase: 'queue', remaining: 0 });
    expect(taskIndicators(s).find(n => n.id === 'receptionGuest')!.areaId).toBe('checkin'); s.facilities.find(f => f.id === 'room1')!.dirty = true;
    expect(taskIndicators(s).some(n => n.id === 'receptionGuest')).toBe(false);
  });
  it('marks available cash and removes the notice after collection', () => { const s = initialResort(); const r = s.facilities.find(f => f.id === 'reception')!; r.cash = 40; expect(taskIndicators(s).find(n => n.id === 'receptionMoney')!.icon).toBe('cash'); r.cash = 0; expect(taskIndicators(s).some(n => n.id === 'receptionMoney')).toBe(false); });
  it('does not mutate saves, creates no duplicate notices and targets real work areas', () => {
    const s = initialResort(true); s.facilities.filter(f => f.kind === 'room').forEach(f => { f.dirty = true; f.towels = 0; }); s.seats.forEach(seat => seat.dirty = true); const before = JSON.stringify(s), ns = taskIndicators(s);
    expect(JSON.stringify(s)).toBe(before); expect(new Set(ns.map(n => n.id)).size).toBe(ns.length);
    for (const n of ns) expect(areasFor(s).some(a => a.id === n.areaId)).toBe(true);
    for (const icon of ['clean', 'towel', 'guest', 'dirty', 'wash', 'cash'] as const) { expect(taskIconSvg(icon)).toContain('viewBox="0 0 24 24"'); expect(taskIconSvg(icon)).toContain('aria-hidden="true"'); }
  });
});
