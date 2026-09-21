import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { CLEAN_TAKE, DIRTY_BASKET, DIRTY_DROP, DIRTY_HAMPER, DIRTY_TAKE, initialResort, LAUNDRY_FRONT_EDGE, LAUNDRY_MACHINE, LAUNDRY_MACHINE_AREA, LAUNDRY_RIGHT_EDGE, LAUNDRY_TRASH, LAUNDRY_TRASH_PROP, TOWEL_RACK } from './data';
import { linenCount } from './Linen';

const advance = (s: ResortSimulation, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) s.tick(.1);
};

describe('visible laundry layout and carrying limits', () => {
  it.each([1, 2, 3])('keeps the open entrance and empty floor accessible at level %i', level => {
    const s = new ResortSimulation(); s.facility('laundry').level = level;
    for (const p of [LAUNDRY_MACHINE_AREA, DIRTY_DROP, DIRTY_TAKE, CLEAN_TAKE, LAUNDRY_TRASH, ...[49, 50].map(y => ({ x: 7, y })), { x: 12, y: 44 }, { x: 14, y: 46 }]) {
      expect(s.isWalkable(p.x, p.y)).toBe(true);
      expect(s.path(s.state.player, p).length, JSON.stringify(p)).toBeGreaterThan(0);
    }
    for (const p of [{ x: 7, y: 42 }, { x: 2, y: 45 }, { x: LAUNDRY_RIGHT_EDGE, y: 43 }, { x: LAUNDRY_RIGHT_EDGE, y: 47 }, { x: 12, y: 43 }, { x: 12, y: 47 }, { x: 7, y: LAUNDRY_FRONT_EDGE }, { x: 12, y: 51 }, { x: LAUNDRY_MACHINE.x, y: LAUNDRY_MACHINE.y }, { x: TOWEL_RACK.x, y: TOWEL_RACK.y }, { x: DIRTY_BASKET.x, y: DIRTY_BASKET.y }, DIRTY_HAMPER, LAUNDRY_TRASH_PROP]) {
      expect(s.isWalkable(p.x, p.y)).toBe(false);
    }
    expect(s.isWalkable(LAUNDRY_RIGHT_EDGE, 45)).toBe(true);
  });

  it('keeps the washer by the left wall and leaves separated, reachable laundry interaction squares', () => {
    const s = new ResortSimulation();
    expect(LAUNDRY_MACHINE.x).toBeLessThan(DIRTY_BASKET.x - 2);
    expect(LAUNDRY_MACHINE_AREA.x).toBeGreaterThan(LAUNDRY_MACHINE.x);
    expect(LAUNDRY_MACHINE_AREA.y).toBe(LAUNDRY_MACHINE.y);
    expect(LAUNDRY_MACHINE.y - DIRTY_BASKET.y).toBeGreaterThanOrEqual(3.5);
    expect(TOWEL_RACK.x - DIRTY_BASKET.x).toBeGreaterThanOrEqual(4);
    const areas = [LAUNDRY_MACHINE_AREA, DIRTY_DROP, DIRTY_TAKE, CLEAN_TAKE, LAUNDRY_TRASH];
    for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
      expect(Math.hypot(areas[i].x - areas[j].x, areas[i].y - areas[j].y)).toBeGreaterThan(1.5);
    }
    for (const area of areas) expect(s.isWalkable(Math.round(area.x), Math.round(area.y))).toBe(true);
    expect(DIRTY_HAMPER.x).toBeLessThan(LAUNDRY_TRASH_PROP.x);
    expect(DIRTY_DROP.x).toBeGreaterThan(DIRTY_HAMPER.x);
    expect(LAUNDRY_TRASH.x).toBeLessThan(LAUNDRY_TRASH_PROP.x);
  });

  it('leaves a continuous two-cell walkway to the left of reception', () => {
    const s = new ResortSimulation();
    for (const x of [15, 16]) for (let y = 42; y <= 49; y++) {
      expect(s.isWalkable(x, y)).toBe(true);
    }
    const route = s.path({ x: 15, y: 49 }, { x: 15, y: 42 });
    expect(route).toHaveLength(7);
    expect(route.every(p => p.x === 15)).toBe(true);
    expect(s.isWalkable(14, 46)).toBe(true);
  });

  it('stops repeated test-mode pickup at two towels', () => {
    const s = new ResortSimulation(initialResort(), true);
    Object.assign(s.state.player, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }); advance(s, 20);
    expect(s.state.player.bag.clean).toBe(2);
    expect(linenCount(s.state.player.bag)).toBe(2);
    expect(s.state.tasks).toHaveLength(0);
  });

  it('takes only one needed sheet while keeping the two-towel limit with infinite test stock', () => {
    const s = new ResortSimulation(initialResort(), true); s.facility('room1').dirty = true;
    Object.assign(s.state.player, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }); advance(s, 20);
    expect(s.state.player.bag.clean).toBe(2);
    expect(s.state.player.bag.cleanSheets).toBe(1);
    expect(linenCount(s.state.player.bag)).toBe(3);
    expect(s.state.tasks).toHaveLength(0);
  });

  it('counts dirty laundry toward the eight-piece test-mode bag capacity', () => {
    const s = new ResortSimulation(initialResort(), true); s.facility('room1').dirty = true;
    Object.assign(s.state.player, { x: CLEAN_TAKE.x, y: CLEAN_TAKE.y }); s.state.player.bag.dirty = 7; advance(s, 20);
    expect(linenCount(s.state.player.bag)).toBe(8);
    expect(s.state.player.bag.cleanSheets).toBe(1);
    expect(s.state.player.bag.clean).toBe(0);
    expect(s.state.tasks).toHaveLength(0);
  });
});
