import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { initialResort, ROOM_WORK, ROOM_DEFS, receptionQueuePoint } from './data';
import { ResortSimulation } from './Simulation';
import { ResortSaveService, validResort } from './SaveService';
import { taskIndicators, taskIconSvg } from './TaskIndicators';
import { TowelShelf } from './TowelShelf';
const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const stand = (s: ResortSimulation, id: string) => { const a = s.area(id)!; Object.assign(s.state.player, { x: a.x, y: a.y }); s.state.player.path = []; };

describe('separate room maintenance jobs', () => {
  it('requires bed, floor and towel service before accepting another guest', () => {
    const s = new ResortSimulation(), f = s.facility('room1'); f.dirty = f.floorDirty = true; f.towels = 0;
    const icons = taskIndicators(s.state); expect(icons.find(n => n.id === 'room1Clean')!.icon).toBe('bed'); expect(icons.find(n => n.id === 'room1FloorClean')!.icon).toBe('clean');
    stand(s, 'room1Work'); advance(s, 6.2); expect(f.dirty).toBe(false); expect(f.floorDirty).toBe(true);
    s.state.player.bag.clean = 1; s.state.player.bag.cleanSheets = 1; advance(s, 3); expect(f.towels).toBe(1);
    s.state.guests.push({ id: 'guest1', ...receptionQueuePoint(0), path: [], phase: 'queue', remaining: 0 });
    stand(s, 'checkin'); advance(s, 3.2); expect(s.state.stats.welcomed).toBe(0);
    stand(s, 'room1Floor'); advance(s, 4.2); expect(f.floorDirty).toBe(false); expect(s.state.player.bag.dirty).toBe(0); expect(s.state.player.bag.dirtySheets).toBe(1);
    stand(s, 'checkin'); advance(s, 3.2); expect(s.state.stats.welcomed).toBe(1);
  });
  it('checkout creates both jobs; a worker completes them and delivers towels', () => {
    const s = new ResortSimulation(), f = s.facility('room1'); f.guest = 'guest1'; f.towels = 0;
    s.state.guests.push({ id: 'guest1', ...ROOM_WORK(ROOM_DEFS[0]), path: [], phase: 'staying', remaining: .1, room: f.id }); s.tick(.2);
    expect(f.dirty).toBe(true); expect(f.floorDirty).toBe(true); s.state.xp = 20; s.hire(); advance(s, 180);
    expect(f.dirty).toBe(false); expect(f.floorDirty).toBe(false); expect(f.towels).toBe(1);
  });
  it('pauses a partial floor job outside its zone, reserves it and restores it from save', () => {
    const s = new ResortSimulation(); s.facility('room1').floorDirty = true; stand(s, 'room1Floor'); advance(s, 1);
    const task = s.state.tasks[0], remaining = task.remaining; s.state.player.x += 2; advance(s, 1); expect(task.remaining).toBe(remaining);
    s.state.xp = 20; s.hire(); expect(s.startTask(s.area('room1Floor')!, s.state.workers[0].id)).toBe(false);
    let raw = ''; const save = new ResortSaveService({ getItem: () => raw, setItem: (_, value) => { raw = value; } });
    expect(save.save(s.state)).toBe(true); expect(validResort(s.state)).toBe(true);
    const loaded = new ResortSimulation(save.load().state); stand(loaded, 'room1Floor'); advance(loaded, 4); expect(loaded.facility('room1').floorDirty).toBe(false);
  });
  it('accepts old saves without floor state but rejects malformed new fields', () => {
    const s = initialResort(); expect(validResort(s)).toBe(true); s.facilities[2].floorDirty = 'yes' as any; expect(validResort(s)).toBe(false);
  });
  it('uses a hanging towel symbol instead of the old bag-like rectangle', () => {
    expect(taskIconSvg('towel')).toContain('M3 4h18'); expect(taskIconSvg('bed')).not.toBe(taskIconSvg('clean'));
  });
});

describe('aligned folded towel stock', () => {
  it.each([2.2, 1.7])('keeps all stacks inside a %s-high shelf and above its boards', height => {
    const shelf = new TowelShelf(color => new T.MeshBasicMaterial({ color }), height); expect(shelf.towels).toHaveLength(12);
    shelf.towels.forEach((towel, i) => {
      const box = new T.Box3().setFromObject(towel); expect(box.min.x).toBeGreaterThan(-.95); expect(box.max.x).toBeLessThan(.95);
      expect(box.min.z).toBeGreaterThan(-.46); expect(box.max.z).toBeLessThan(.46);
      const level = Math.floor(i / 4); expect(box.min.y).toBeGreaterThan(.28 + level * .68 + .039); expect(box.max.y).toBeLessThan(.96 + level * .68 - .039);
      expect(towel.geometry.userData.generated).toBe(true);
    });
  });
});
