import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { STAFF_AREAS, staffHireCost, staffIconSvg } from './StaffHiring';

describe('department-specific hiring', () => {
  it('starts at 200 and gets 100 more expensive after every hire', () => {
    expect([0, 1, 2, 3].map(staffHireCost)).toEqual([200, 300, 400, 500]);
  });
  it('uses a distinct SVG pictogram for every department without text captions', () => {
    const icons = STAFF_AREAS.map(a => staffIconSvg(a.role));
    expect(new Set(icons).size).toBe(STAFF_AREAS.length);
    for (const icon of icons) {
      expect(icon).toContain('viewBox="0 0 32 32"');
      expect(icon).not.toContain('<text');
      expect(icon).toContain('aria-hidden="true"');
    }
  });
  it.each(STAFF_AREAS)('hires the correct role at $id and removes only its own marker', definition => {
    const s = new ResortSimulation(); s.facility('pool').open = true; s.state.bar!.open = true; s.state.money = 500;
    if (definition.role === 'rooms') s.state.xp = 15;
    const area = s.area(definition.id)!;
    expect(s.isWalkable(area.x, area.y)).toBe(true);
    expect(s.path(s.state.player, area).length).toBeGreaterThan(0);
    Object.assign(s.state.player, { x: area.x, y: area.y });
    expect(s.purchaseArea(area)).toBe(true);
    expect(s.state.workers[0].role).toBe(definition.role);
    expect(s.state.money).toBe(300);
    expect(s.area(definition.id)).toBeUndefined();
    expect(s.areas.filter(a => STAFF_AREAS.some(d => d.id === a.id))).toHaveLength(STAFF_AREAS.length - 1);
    expect(s.purchaseArea(area)).toBe(false);
    expect(s.state.money).toBe(300);
  });
  it('shows the pool hiring marker only after opening the pool', () => {
    const s = new ResortSimulation();
    expect(['receptionHire', 'roomsHire', 'haulingHire'].every(id => !!s.area(id))).toBe(true);
    expect(s.area('poolHire')).toBeUndefined();
    s.facility('pool').open = true; expect(s.area('poolHire')).toBeDefined();
  });
  it('keeps the first cleaner hire pad against the left promenade edge and reachable', () => {
    const s = new ResortSimulation(), area = s.area('roomsHire')!;
    expect(area.x).toBe(12.25);
    expect(s.isWalkable(Math.round(area.x), area.y)).toBe(true);
    expect(s.path(s.state.player, area).length).toBeGreaterThan(0);
  });
  it('places the laundry worker marker outside, below the side entrance', () => {
    const s = new ResortSimulation(), area = s.area('haulingHire')!;
    expect(area.x).toBeGreaterThan(11.5); expect(area.y).toBeGreaterThan(46);
    expect(s.isWalkable(area.x, area.y)).toBe(true);
    expect(s.path(s.state.player, area).length).toBeGreaterThan(0);
  });
  it('unlocks the first cleaner at level two and the second at level four', () => {
    const s = new ResortSimulation(); s.state.money = 1000;
    const first = s.area('roomsHire')!;
    Object.assign(s.state.player, first); expect(s.purchaseArea(first)).toBe(false); expect(s.state.workers).toHaveLength(0);
    s.state.xp = 15; expect(s.purchaseArea(first)).toBe(true); expect(s.state.workers).toHaveLength(1);
    expect(s.area('roomsHire')).toBeUndefined(); expect(s.area('roomsHire2')).toBeUndefined();
    for (const id of ['room2', 'room3', 'room4']) s.facility(id).open = true;
    const second = s.area('roomsHire2')!; expect(s.requiredLevel(second)).toBe(4);
    expect(second.x).toBe(12.25); expect(second.y).toBe(27);
    expect(s.isWalkable(Math.round(second.x), second.y)).toBe(true);
    Object.assign(s.state.player, second); expect(s.purchaseArea(second)).toBe(false); expect(s.state.workers).toHaveLength(1);
    s.state.xp = 100; expect(s.purchaseArea(second)).toBe(true); expect(s.state.workers.filter(w => w.role === 'rooms')).toHaveLength(2);
  });
});
