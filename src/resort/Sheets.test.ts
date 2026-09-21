import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { linenCount } from './Linen';
import { ResortSaveService, validResort } from './SaveService';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => { const a = s.area(id)!; Object.assign(s.state.player, { x: a.x, y: a.y, path: [] }); };

describe('physical sheet laundry cycle', () => {
  it('collects one dirty sheet, washes it, and consumes a clean sheet when remaking the bed', () => {
    const s = new ResortSimulation(), room = s.facility('room1'); room.dirty = true; room.towels = 0;
    stand(s, 'room1Work'); advance(s, 6.2);
    expect(s.state.player.bag.dirtySheets).toBe(1); expect(s.state.player.bag.dirty).toBe(0); expect(room.needsSheet).toBe(true); expect(linenCount(s.state.player.bag)).toBe(1);
    const cleanSheets = s.state.laundry.cleanSheets!; stand(s, 'dirtyDrop'); advance(s, 9);
    expect(s.state.laundry.remaining).toBeNull(); expect(s.state.stats.washed).toBe(0);
    stand(s, 'laundryDirtyTake'); advance(s, 2.8);
    stand(s, 'machineLoad'); advance(s, 11); stand(s, 'machineUnload'); advance(s, .7);
    expect(s.state.player.bag.dirtySheets).toBe(0); expect(s.state.laundry.cleanSheets).toBe(cleanSheets + 1); expect(s.state.stats.washed).toBe(2);
    stand(s, 'cleanTake'); advance(s, 2); expect(s.state.player.bag.cleanSheets).toBe(1); expect(linenCount(s.state.player.bag)).toBe(2);
    stand(s, 'room1Work'); advance(s, 3); expect(room.needsSheet).toBe(false); expect(s.state.player.bag.cleanSheets).toBe(0); expect(s.state.player.bag.clean).toBe(0); expect(room.towels).toBe(1);
  });
  it('takes longer to spread a clean sheet than to leave a towel', () => {
    const sheetSim = new ResortSimulation(), sheetRoom = sheetSim.facility('room1');
    sheetRoom.needsSheet = true; sheetRoom.towels = 0;
    sheetSim.state.player.bag.cleanSheets = 1; sheetSim.state.player.bag.clean = 1;
    stand(sheetSim, 'room1Work');
    expect(sheetSim.startTask(sheetSim.area('room1Work')!)).toBe(true);
    expect(sheetSim.state.tasks[0].total).toBeCloseTo(2.4);

    const towelSim = new ResortSimulation(), towelRoom = towelSim.facility('room1');
    towelRoom.towels = 0; towelSim.state.player.bag.clean = 1;
    stand(towelSim, 'room1Work');
    expect(towelSim.startTask(towelSim.area('room1Work')!)).toBe(true);
    expect(towelSim.state.tasks[0].total).toBeCloseTo(.6);
  });
  it('can replace the towel before the clean sheet arrives', () => {
    const s = new ResortSimulation(), room = s.facility('room1'); room.dirty = true;
    s.state.player.bag = { clean: 4, dirty: 2, dirtySheets: 1 }; stand(s, 'room1Work'); advance(s, 7); expect(room.dirty).toBe(true);
    s.state.player.bag = { clean: 1, dirty: 0 }; room.dirty = false; room.needsSheet = true; room.towels = 0; advance(s, 1);
    expect(room.needsSheet).toBe(true); expect(room.towels).toBe(1); expect(s.state.player.bag.clean).toBe(0);
  });
  it('holds a washed sheet when its output shelf fills, without losing or duplicating it', () => {
    const s = new ResortSimulation(), l = s.state.laundry; l.cleanSheets = 23; s.state.player.bag.dirtySheets = 1; stand(s, 'machineLoad'); advance(s, .7);
    expect(l.washingKind).toBe('sheet'); Object.assign(s.state.player, { x: 19, y: 48 }); l.cleanSheets = 24; advance(s, 11); expect(l.remaining).toBe(0); expect(l.cleanSheets).toBe(24);
    stand(s, 'machineUnload'); advance(s, .7); expect(s.state.player.bag.cleanSheets ?? 0).toBe(0); expect(l.cleanSheets).toBe(24);
    l.cleanSheets = 23; advance(s, .7); expect(l.cleanSheets).toBe(24); expect(l.clean).toBe(9); expect(l.remaining).toBeNull(); expect(s.state.stats.washed).toBe(2);
  });
  it('respects shared dirty-basket capacity when depositing mixed linen', () => {
    const s = new ResortSimulation(); s.state.laundry.dirty = 23; s.state.laundry.clean = 24; s.state.laundry.cleanSheets = 24;
    s.state.player.bag = { clean: 0, dirty: 1, dirtySheets: 2 }; stand(s, 'dirtyDrop'); advance(s, 1);
    expect(s.state.laundry.dirty).toBe(24); expect(s.state.player.bag.dirtySheets).toBe(2); expect(linenCount(s.state.player.bag)).toBe(2);
  });
  it('preserves bag sheets and a partial washing cycle across pause and save/load', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirtySheets = 2; stand(s, 'machineLoad'); advance(s, 1); s.state.settings.paused = true;
    const before = structuredClone(s.state); advance(s, 3); expect(s.state).toEqual(before); expect(validResort(s.state)).toBe(true);
    let raw = ''; const save = new ResortSaveService({ getItem: () => raw, setItem: (_, value) => { raw = value; } }); save.save(s.state);
    const loaded = new ResortSimulation(save.load().state); expect(loaded.state).toEqual(s.state); loaded.state.settings.paused = false; advance(loaded, 10);
    expect(loaded.state.laundry.cleanSheets).toBe(8); expect(loaded.state.laundry.remaining).toBe(0); expect(loaded.state.player.bag.dirtySheets).toBe(0); expect(loaded.state.laundry.washingSheets).toBe(2);
  });
  it('rejects negative sheet inventory and total bag overflow', () => {
    const s = new ResortSimulation(); s.state.player.bag.dirtySheets = -1; expect(validResort(s.state)).toBe(false);
    s.state.player.bag = { clean: 4, dirty: 4, dirtySheets: 1 }; expect(validResort(s.state)).toBe(false);
  });
  it('workers carry, wash and replace sheets autonomously', () => {
    const s = new ResortSimulation(); s.state.xp = 20; s.state.money = 1000; s.hire(); s.hire('hauling'); const room = s.facility('room1'); room.dirty = true; room.towels = 0;
    advance(s, 160); expect(room.needsSheet).toBe(false); expect(s.state.stats.washed).toBe(2); expect(validResort(s.state)).toBe(true);
  });
});
