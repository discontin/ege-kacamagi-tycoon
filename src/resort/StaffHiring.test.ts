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
  it('only offers pool staff after the pool opens', () => {
    const s = new ResortSimulation(); expect(s.area('poolHire')).toBeUndefined();
    s.facility('pool').open = true; expect(s.area('poolHire')).toBeDefined();
  });
  it('unlocks the first cleaner at level two and the second at level four', () => {
    const s = new ResortSimulation(); s.state.money = 1000;
    const first = s.area('roomsHire')!;
    Object.assign(s.state.player, first); expect(s.purchaseArea(first)).toBe(false); expect(s.state.workers).toHaveLength(0);
    s.state.xp = 15; expect(s.purchaseArea(first)).toBe(true); expect(s.state.workers).toHaveLength(1);
    const second = s.area('roomsHire2')!; expect(s.requiredLevel(second)).toBe(4);
    Object.assign(s.state.player, second); expect(s.purchaseArea(second)).toBe(false); expect(s.state.workers).toHaveLength(1);
    s.state.xp = 100; expect(s.purchaseArea(second)).toBe(true); expect(s.state.workers.filter(w => w.role === 'rooms')).toHaveLength(2);
  });
});
