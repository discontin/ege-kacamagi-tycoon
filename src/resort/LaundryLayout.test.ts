import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { initialResort } from './data';
import { linenCount } from './Linen';

const advance = (s: ResortSimulation, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) s.tick(.1);
};

describe('visible laundry layout and carrying limits', () => {
  it.each([1, 2, 3])('keeps the open entrance and empty floor accessible at level %i', level => {
    const s = new ResortSimulation(); s.facility('laundry').level = level;
    for (const p of [{ x: 9, y: 48 }, { x: 4, y: 44 }, { x: 9, y: 46 }, { x: 11, y: 46 }, { x: 14, y: 46 }]) {
      expect(s.isWalkable(p.x, p.y)).toBe(true);
      expect(s.path(s.state.player, p).length).toBeGreaterThan(0);
    }
    for (const p of [{ x: 9, y: 42 }, { x: 2, y: 45 }, { x: 13, y: 43 }, { x: 13, y: 46 }, { x: 5, y: 45 }, { x: 12, y: 45 }, { x: 10, y: 45 }]) {
      expect(s.isWalkable(p.x, p.y)).toBe(false);
    }
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
    Object.assign(s.state.player, { x: 12, y: 45.5 }); advance(s, 20);
    expect(s.state.player.bag.clean).toBe(2);
    expect(linenCount(s.state.player.bag)).toBe(2);
    expect(s.state.tasks).toHaveLength(0);
  });

  it('limits fresh sheets to two and towels to two even with infinite test stock', () => {
    const s = new ResortSimulation(initialResort(), true); s.facility('room1').dirty = true;
    Object.assign(s.state.player, { x: 12, y: 45.5 }); advance(s, 20);
    expect(s.state.player.bag.clean).toBe(2);
    expect(s.state.player.bag.cleanSheets).toBe(2);
    expect(linenCount(s.state.player.bag)).toBe(4);
    expect(s.state.tasks).toHaveLength(0);
  });

  it('counts dirty laundry toward the eight-piece test-mode bag capacity', () => {
    const s = new ResortSimulation(initialResort(), true); s.facility('room1').dirty = true;
    Object.assign(s.state.player, { x: 12, y: 45.5 }); s.state.player.bag.dirty = 6; advance(s, 20);
    expect(linenCount(s.state.player.bag)).toBe(8);
    expect(s.state.player.bag.cleanSheets).toBe(2);
    expect(s.state.player.bag.clean).toBe(0);
    expect(s.state.tasks).toHaveLength(0);
  });
});
