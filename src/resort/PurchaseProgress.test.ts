import { describe, expect, it } from 'vitest';
import { ResortSimulation } from './Simulation';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
describe('purchase progress rings', () => {
  it.each(['receptionHire', 'room2Buy', 'poolBuy'])('fills with the actual hold timer for %s', id => {
    const s = new ResortSimulation(); s.state.xp = id === 'poolBuy' ? 315 : 100; s.state.money = 1000;
    if (id === 'poolBuy') for (const room of ['room2', 'room3', 'room4', 'room5', 'room6']) s.facility(room).open = true;
    const a = s.area(id)!; Object.assign(s.state.player, { x: a.x, y: a.y, path: [] });
    expect(s.purchaseProgress(a)).toBeUndefined(); advance(s, .6);
    expect(s.purchaseProgress(a)).toBeCloseTo(.6 / 1.3);
    s.state.settings.paused = true; advance(s, 1); expect(s.purchaseProgress(a)).toBeCloseTo(.6 / 1.3);
    s.state.settings.paused = false; advance(s, .8); expect(s.purchaseProgress(a)).toBeUndefined();
    if (id === 'receptionHire') expect(s.state.workers.some(w => w.role === 'reception')).toBe(true);
    else expect(s.facility(a.target).open).toBe(true);
  });
  it('clears on leaving and never shows a successful-looking ring without money', () => {
    const s = new ResortSimulation(); s.state.money = 200; const a = s.area('receptionHire')!;
    Object.assign(s.state.player, { x: a.x, y: a.y, path: [] }); advance(s, .5);
    expect(s.purchaseProgress(a)).toBeDefined(); s.state.player.x += 3; s.tick(.1);
    expect(s.purchaseProgress(a)).toBeUndefined(); s.state.money = 0;
    Object.assign(s.state.player, { x: a.x, y: a.y }); advance(s, .5);
    expect(s.purchaseProgress(a)).toBeUndefined(); expect(s.state.workers).toHaveLength(0);
  });
});
