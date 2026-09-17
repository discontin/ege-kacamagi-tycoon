import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };

describe('laundry trash bin', () => {
  it('discards carried laundry one item per completed action, dirty items first', () => {
    const s = new ResortSimulation(), area = s.area('laundryTrash')!;
    s.state.player.bag = { clean: 1, dirty: 2, cleanSheets: 1, dirtySheets: 1 };
    Object.assign(s.state.player, { x: area.x, y: area.y, path: [] });
    advance(s, .6); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 2, cleanSheets: 1, dirtySheets: 1 });
    advance(s, .5); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 1, cleanSheets: 1, dirtySheets: 1 });
    advance(s, 1.2); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 0, cleanSheets: 1, dirtySheets: 1 });
    advance(s, 1.2); expect(s.state.player.bag).toEqual({ clean: 1, dirty: 0, cleanSheets: 1, dirtySheets: 0 });
  });

  it('is reachable, refuses empty hands and permits room cleaners to discard carried items', () => {
    const s = new ResortSimulation(), area = s.area('laundryTrash')!;
    expect(s.path(s.state.player, area).length).toBeGreaterThan(0);
    Object.assign(s.state.player, { x: area.x, y: area.y, path: [] }); expect(s.startTask(area)).toBe(false);
    s.hire('rooms'); const cleaner = s.state.workers[0]; cleaner.bag.cleanSheets = 1;
    expect(s.startTask(area, cleaner.id)).toBe(true);
    s.hire('hauling'); const hauler = s.state.workers[1]; hauler.bag.cleanSheets = 1;
    expect(s.startTask(area, hauler.id)).toBe(false);
  });
});
