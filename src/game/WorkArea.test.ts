import { describe, expect, it } from 'vitest';
import { Simulation, count } from './Simulation';

const advance = (s: Simulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const setup = () => { const s = new Simulation(), b = s.state.buildings.find(b => b.kind === 'recycling')!; Object.assign(s.state.player, s.entrance(b)); return { s, b }; };

describe('automatic square work areas', () => {
  it('starts, collects and repeats without an interaction key', () => {
    const { s, b } = setup(); advance(s, 20);
    expect(s.state.stats.produced.organic).toBe(4); expect(s.state.player.bag.organic).toBe(4); expect(b.output.organic).toBe(0);
  });
  it('does not trigger outside the square, including a nearby diagonal', () => {
    const { s, b } = setup(); s.state.player.x += .51; s.state.player.y += .51; advance(s, 2); expect(b.job).toBeUndefined();
  });
  it('waits safely with missing inputs and starts once supplies arrive', () => {
    const { s, b } = setup(); s.state.inventory = {}; advance(s, 2); expect(b.job).toBeUndefined();
    s.state.inventory.waste = 3; advance(s, 1); expect(b.job?.owner).toBe('player');
  });
  it('waits with a full bag and deposits automatically at the warehouse', () => {
    const { s, b } = setup(); s.state.player.bag = { organic: 12 }; b.output = { metal: 2 }; advance(s, 1);
    expect(b.output.metal).toBe(2); expect(count(s.state.player.bag)).toBe(12);
    const depot = s.state.buildings.find(b => b.kind === 'warehouse')!; Object.assign(s.state.player, s.entrance(depot)); advance(s, 1);
    expect(count(s.state.player.bag)).toBe(0); expect(s.state.inventory.organic).toBe(12);
  });
  it('freezes while paused and respects worker ownership', () => {
    const { s, b } = setup(); s.state.settings.paused = true; advance(s, 2); expect(b.job).toBeUndefined();
    s.state.settings.paused = false; s.startJob(b.id, 'worker'); advance(s, 2); expect(b.job?.owner).toBe('worker'); expect(s.state.player.activeBuilding).toBeUndefined();
  });
});
