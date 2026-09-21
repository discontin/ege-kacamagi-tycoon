import { describe, expect, it } from 'vitest';
import { initialResort, ROOM_DEFS } from './data';
import { ResortSimulation } from './Simulation';
import { taskIndicators } from './TaskIndicators';
import { workAreaContains } from './WorkAreas';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const singleBedSides = [{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 4.5, y: 1 }, { x: 5, y: 5 }];

describe('bedside work region', () => {
  it.each(singleBedSides)('automatically cleans from accessible bedside position %j in every bungalow', offset => {
    for (const r of ROOM_DEFS) {
      const s = new ResortSimulation(initialResort(true), true), f = s.facility(r.id); f.dirty = true; f.towels = 0;
      Object.assign(s.state.player, { x: r.x + offset.x, y: r.y + offset.y });
      expect(s.isWalkable(Math.round(s.state.player.x), Math.round(s.state.player.y))).toBe(true);
      advance(s, 6.2); expect(f.dirty).toBe(false); expect(s.state.stats.cleaned).toBe(1); expect(s.state.player.bag.dirty).toBe(0); expect(s.state.player.bag.dirtySheets).toBe(1);
    }
  });
  it('continues the same job and indicator on another side, pauses outside and resumes after load', () => {
    const s = new ResortSimulation(), r = ROOM_DEFS[0]; s.facility(r.id).dirty = true;
    Object.assign(s.state.player, { x: r.x + 3, y: r.y + 3 }); advance(s, 1);
    const task = s.state.tasks[0], remaining = task.remaining;
    Object.assign(s.state.player, { x: r.x + 6, y: r.y + 3 }); advance(s, 1);
    expect(s.state.tasks[0].id).toBe(task.id); expect(task.remaining).toBeLessThan(remaining);
    expect(taskIndicators(s.state).find(n => n.id === 'room1Clean')!.state).toBe('working');
    s.state.player.x = r.x + 7; const held = task.remaining; advance(s, 1);
    expect(task.remaining).toBe(held); expect(taskIndicators(s.state).find(n => n.id === 'room1Clean')!.state).toBe('waiting');
    const loaded = new ResortSimulation(JSON.parse(JSON.stringify(s.state)));
    Object.assign(loaded.state.player, { x: r.x + 3, y: r.y + 5 }); advance(loaded, 5);
    expect(loaded.facility(r.id).dirty).toBe(false); expect(loaded.state.stats.cleaned).toBe(1);
  });
  it('excludes the mattress, walls and distant room furniture and leaves other squares unchanged', () => {
    const s = new ResortSimulation(), r = ROOM_DEFS[0]; s.facility(r.id).dirty = true; const a = s.area('room1Work')!;
    for (const offset of [{ x: 4.5, y: 3 }, { x: 0, y: 5 }, { x: 2, y: 5 }, { x: 8, y: 3 }, { x: 4, y: 7 }]) {
      Object.assign(s.state.player, { x: r.x + offset.x, y: r.y + offset.y });
      expect(workAreaContains(s.state.player, a)).toBe(false); advance(s, .3); expect(s.state.tasks).toHaveLength(0);
    }
    const reception = s.area('checkin')!; expect(workAreaContains({ x: reception.x + .51, y: reception.y }, reception)).toBe(false);
  });
  it('does not start level-one cleaning from either doorway or the path just inside it', () => {
    for (const r of ROOM_DEFS) {
      const s = new ResortSimulation(initialResort(true), true), f = s.facility(r.id); f.dirty = true;
      const entranceX = r.x < 15 ? 9 : 0;
      for (const x of [entranceX, r.x < 15 ? 7 : 2]) {
        Object.assign(s.state.player, { x: r.x + x, y: r.y + 5 });
        expect(workAreaContains(s.state.player, s.area(`${r.id}Work`)!)).toBe(false);
        advance(s, .3); expect(s.state.tasks).toHaveLength(0);
      }
    }
  });
  it('uses the wider visible mattress when a room reaches level two', () => {
    const s = new ResortSimulation(initialResort(true), true), r = ROOM_DEFS[1], f = s.facility(r.id); f.level = 2; f.dirty = true;
    const area = s.area(`${r.id}Work`)!;
    expect(workAreaContains({ x: r.x + 1, y: r.y + 3 }, area)).toBe(true);
    expect(workAreaContains({ x: r.x, y: r.y + 5 }, area)).toBe(false);
  });
  it('restocks at any bed edge and retains full-bag and task-reservation protections', () => {
    const s = new ResortSimulation(), r = ROOM_DEFS[0], f = s.facility(r.id); f.towels = 0;
    Object.assign(s.state.player, { x: r.x + 3, y: r.y + 3 }); s.state.player.bag.clean = 1; advance(s, 1);
    expect(f.towels).toBe(1); expect(s.state.player.bag.clean).toBe(0);
    f.dirty = true; s.state.player.bag = { clean: 4, dirty: 4 }; advance(s, 1); expect(s.state.tasks).toHaveLength(0);
    expect(s.message).toBe('Çanta dolu. Yatağı temizlemek için önce elindekileri bırak.');
    const messageId = s.messageId; advance(s, 1); expect(s.messageId).toBe(messageId);
    s.state.player.bag = { clean: 0, dirty: 0 }; s.state.xp = 20; s.hire();
    expect(s.startTask(s.area('room1Work')!, s.state.workers[0].id)).toBe(true);
    expect(s.startTask(s.area('room1Work')!)).toBe(false);
  });
});
