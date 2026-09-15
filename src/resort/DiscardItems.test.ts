import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };

describe('laundry trash bin', () => {
  it('discards carried laundry one item per completed action, dirty items first', () => {
    const s = new ResortSimulation(), area = s.area('laundryTrash')!;
    s.state.player.bag = { clean: 1, dirty: 2, cleanSheets: 1, dirtySheets: 1 };
    Object.assign(s.state.player, { x: area.x, y: area.y, path: [] });
    advance(s, .6); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 1, cleanSheets: 1, dirtySheets: 1 });
    advance(s, .6); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 0, cleanSheets: 1, dirtySheets: 1 });
    advance(s, .6); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 0, cleanSheets: 1, dirtySheets: 0 });
  });

  it('is reachable, refuses empty hands and is never assigned to staff', () => {
    const s = new ResortSimulation(), area = s.area('laundryTrash')!;
    expect(s.path(s.state.player, area).length).toBeGreaterThan(0);
    Object.assign(s.state.player, { x: area.x, y: area.y, path: [] }); expect(s.startTask(area)).toBe(false);
    s.hire('rooms'); expect(s.startTask(area, s.state.workers[0].id)).toBe(false);
  });
});
