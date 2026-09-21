import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';

describe('idle room-cleaner patrol', () => {
  it('leaves the previous job location and patrols the central corridor while idle', () => {
    const s = new ResortSimulation(); s.hire('rooms'); const cleaner = s.state.workers[0];
    Object.assign(cleaner, { x: 7, y: 37, path: [] });
    s.tick(.1);
    expect(cleaner.status).toBe('Koridorda devriye geziyor');
    expect(cleaner.path.length).toBeGreaterThan(0);
    const destination = cleaner.path.at(-1)!;
    expect(destination.x).toBeGreaterThanOrEqual(15); expect(destination.x).toBeLessThanOrEqual(21);
    expect([19, 29, 39]).toContain(destination.y);
  });

  it('interrupts its patrol immediately when a room needs cleaning', () => {
    const s = new ResortSimulation(); s.hire('rooms'); const cleaner = s.state.workers[0];
    s.tick(.1); expect(cleaner.path.length).toBeGreaterThan(0);
    s.facility('room1').dirty = true; s.tick(.1);
    expect(s.state.tasks.find(task => task.owner === cleaner.id)?.kind).toBe('cleanRoom');
    expect(cleaner.status).toContain('Yatak yanında');
  });
});
