import type { BoostState } from './types';
export interface RewardedBoostService { requestReward(): Promise<BoostState | null> }
export class SimulatedRewardedBoostService implements RewardedBoostService {
  async requestReward(): Promise<BoostState> { return { multiplier: 1.5, remaining: 120 }; }
}
