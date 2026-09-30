export type RewardKind = 'boost' | 'money';
export type RewardedAdResult = 'completed' | 'unavailable' | 'failed';

type CrazyGamesSdk = {
  init: () => Promise<void>;
  environment?: 'disabled' | 'local' | 'crazygames' | string;
  ad: { requestAd: (type: 'rewarded', callbacks: { adStarted: () => void; adError: (error: unknown) => void; adFinished: () => void }) => void };
};

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSdk };
    /** Injected by the Android WebView host; resolve true only from AdMob's earned-reward callback. */
    AndroidAds?: { showRewardedAd: (reward: RewardKind, onStarted: () => void) => Promise<boolean> };
  }
}

let initialized = false;
let initFailed = false;
let initialization: Promise<void> | undefined;

export function initializeRewardedAds(): Promise<void> {
  const sdk = window.CrazyGames?.SDK;
  if (!sdk || initialized || initFailed) return Promise.resolve();
  if (initialization) return initialization;
  initialization = sdk.init().then(() => { initialized = true; }).catch(error => {
    initFailed = true;
    console.warn('CrazyGames SDK could not initialize; rewarded ads remain unavailable.', error);
  });
  return initialization;
}

export function rewardedAdProvider(): 'crazygames' | 'google-play' | 'unavailable' | 'loading' {
  if (window.AndroidAds?.showRewardedAd) return 'google-play';
  const sdk = window.CrazyGames?.SDK;
  if (sdk && !initialized && !initFailed) return 'loading';
  if (sdk && initialized && (sdk.environment === 'crazygames' || sdk.environment === 'local')) return 'crazygames';
  return 'unavailable';
}

export function requestRewardedAd(reward: RewardKind, onStarted: () => void): Promise<RewardedAdResult> {
  const provider = rewardedAdProvider();
  if (provider === 'google-play') {
    return window.AndroidAds!.showRewardedAd(reward, onStarted)
      .then(earned => earned ? 'completed' : 'failed')
      .catch(error => { console.warn('Android rewarded ad failed.', error); return 'failed'; });
  }
  if (provider !== 'crazygames') return Promise.resolve('unavailable');

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: RewardedAdResult) => { if (!settled) { settled = true; resolve(result); } };
    try {
      window.CrazyGames!.SDK.ad.requestAd('rewarded', {
        adStarted: onStarted,
        adError: error => { console.warn('CrazyGames rewarded ad failed.', error); finish('failed'); },
        adFinished: () => finish('completed'),
      });
    } catch (error) {
      console.warn('CrazyGames rewarded ad request failed.', error);
      finish('failed');
    }
  });
}
