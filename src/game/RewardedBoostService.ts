import type { BoostState } from './types';
export const SKATEBOARD_BOOST_SECONDS = 90;
export interface RewardedBoostService { requestReward(): Promise<BoostState | null> }
export class SimulatedRewardedBoostService implements RewardedBoostService {
  async requestReward(): Promise<BoostState> { return { multiplier: 1.5, remaining: SKATEBOARD_BOOST_SECONDS }; }
}
