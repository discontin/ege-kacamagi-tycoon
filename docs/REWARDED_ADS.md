# Rewarded ads by release platform

The game requests rewarded video only from the pause menu. A reward is applied only after the platform reports a completed/earned ad. An unavailable or interrupted ad grants nothing. The normal browser/GitHub Pages build intentionally has no simulated ad rewards.

## CrazyGames

- `index.html` loads the official CrazyGames SDK v3 script.
- `src/resort/RewardedAdService.ts` initializes the SDK and requests `rewarded` ads. The game remains paused while the ad is shown and mutes game audio on `adStarted`.
- The boost grants 120 seconds at 1.5× speed. The cash reward is $100. Each offer reappears on the existing 120-second game-time cooldown.
- The SDK's local environment can be used for local SDK testing. The SDK is unavailable on unrelated hosting domains, so those domains display no pretend ad completion.

## Google Play / Android WebView bridge

This repository currently contains a Vite web game, not an Android/Gradle application. Therefore AdMob is not installed or live-ready yet. The web side is prepared to use the following host-injected bridge:

```ts
window.AndroidAds.showRewardedAd(
  reward: 'boost' | 'money',
  onStarted: () => void,
): Promise<boolean>
```

The Android host should show a Google Mobile Ads rewarded ad and resolve `true` only after `OnUserEarnedRewardListener` fires for that ad. Resolve `false` on dismissal without earning, no-fill, or error. Call `onStarted` when the ad begins so the WebView game audio is muted. The bridge must be installed by the app itself; do not expose it to untrusted remote pages. Use Google's test ad unit IDs during development and configure the real AdMob app/ad-unit IDs only in the Android project before release.

Until that native wrapper exists, the Google Play card stays unavailable instead of awarding test money or boost. Do not commit AdMob secrets or production IDs to this web repository.

## Other web game portals

Each portal can require its own SDK and ad approval. CrazyGames is the only portal adapter wired in this web build; do not reuse its SDK on another portal or silently fall back to simulated rewards. Add and verify a portal-specific provider adapter after choosing the destination site.
