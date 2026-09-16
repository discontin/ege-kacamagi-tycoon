import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';
import { initialResort } from './data';
import { ResortSaveService, validResort } from './SaveService';
describe('reset and settings', () => {
  it('resets live state so later autosaves cannot restore the old village', () => {
    const s = new ResortSimulation(); s.state.money = 1000; s.hire(); s.state.settings.paused = true; s.state.settings.volume = .3;
    s.reset(); expect(s.state.workers).toHaveLength(0); expect(s.state.money).toBe(0); expect(s.state.settings.paused).toBe(false); expect(s.state.settings.volume).toBe(.3);
    let raw = ''; const save = new ResortSaveService({ getItem: () => raw, setItem: (_, v) => { raw = v; } });
    save.save(s.state); expect(save.load().state.money).toBe(0); expect(save.load().state.workers).toHaveLength(0);
  });
  it('resets test mode without writing normal progress', () => {
    const s = new ResortSimulation(initialResort(true), true); s.state.settings.speed = 2; s.state.settings.paused = true; s.reset();
    expect(s.state.settings).toMatchObject({ paused: false, speed: 1 }); expect(s.state.facilities.every(f => f.open)).toBe(true);
    let writes = 0; new ResortSaveService({ getItem: () => null, setItem: () => { writes++; } }, true).save(s.state); expect(writes).toBe(0);
  });
  it('accepts old saves and validates audio level bounds', () => {
    const s = initialResort(); expect(validResort(s)).toBe(true);
    for (const volume of [0, .5, 1]) { s.settings.volume = volume; expect(validResort(s)).toBe(true); }
    for (const volume of [-1, 2, NaN]) { s.settings.volume = volume; expect(validResort(s)).toBe(false); }
  });
  it('migrates former level-three rooms to level two without losing the save', () => {
    const old = initialResort(); old.facilities.find(f => f.id === 'room1')!.level = 3;
    const save = new ResortSaveService({ getItem: () => JSON.stringify(old), setItem: () => {} });
    const loaded = save.load(); expect(loaded.existing).toBe(true); expect(loaded.recovered).toBe(false); expect(loaded.state.facilities.find(f => f.id === 'room1')!.level).toBe(2);
  });
});
