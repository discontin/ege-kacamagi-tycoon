import { describe, expect, it } from 'vitest';
import { initialResort } from './data';
import { ResortSimulation } from './Simulation';
import { taskIndicators } from './TaskIndicators';

const advance = (s: ResortSimulation, seconds: number) => { for (let i = 0; i < seconds * 10; i++) s.tick(.1); };
const standAt = (s: ResortSimulation, id: string) => Object.assign(s.state.player, s.area(id), { path: [] });

describe('rewarded map stations', () => {
  it('shows boost and money reward icons as map guidance', () => {
    const notices = taskIndicators(initialResort());
    expect(notices.find(n => n.id === 'rewardedBoost')?.icon).toBe('boost');
    expect(notices.find(n => n.id === 'rewardedMoney')?.icon).toBe('adMoney');
  });

  it('gives the player skates and a timed speed boost after the boost ad', () => {
    const s = new ResortSimulation(); standAt(s, 'rewardedBoost');
    expect(s.startTask(s.area('rewardedBoost')!)).toBe(true);
    advance(s, 4.1);
    expect(s.state.boost).toEqual({ multiplier: 1.5, remaining: expect.any(Number) });
    expect(s.state.boost.remaining).toBeGreaterThan(119);
    expect(s.boost).toBe(1.5);
  });

  it('adds a cash reward after the money ad', () => {
    const s = new ResortSimulation(), startingMoney = s.state.money; standAt(s, 'rewardedMoney');
    expect(s.startTask(s.area('rewardedMoney')!)).toBe(true);
    advance(s, 3.1);
    expect(s.state.money).toBe(startingMoney + 100);
    expect(s.state.stats.earned).toBe(100);
  });

  it('cycles both ad rewards through temporary central-road spots', () => {
    const s = new ResortSimulation();
    expect(taskIndicators(s.state).some(n => n.id === 'rewardedBoost')).toBe(true);
    expect(taskIndicators(s.state).some(n => n.id === 'rewardedMoney')).toBe(true);
    advance(s, 26);
    expect(taskIndicators(s.state).some(n => n.id === 'rewardedBoost')).toBe(false);
    expect(taskIndicators(s.state).some(n => n.id === 'rewardedMoney')).toBe(false);
    advance(s, 121);
    const respawned = taskIndicators(s.state).filter(n => n.id === 'rewardedBoost' || n.id === 'rewardedMoney');
    expect(respawned).toHaveLength(2);
    expect(respawned.every(n => n.x >= 15 && n.x <= 21 && n.y >= 14 && n.y <= 38)).toBe(true);
  });
});
