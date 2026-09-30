type MusicTrack = { title: string; src: string };

const TRACKS: MusicTrack[] = [
  { title: 'Akdeniz Esintisi', src: '/music/olive-coast-track-1.m4a' },
  { title: 'Gün Batımı', src: '/music/olive-coast-track-2.m4a' },
];

/** Background music playlist; both provided tracks repeat continuously in sequence. */
export class ResortMusic {
  private audio = new Audio();
  private index = 0;
  private gamePaused = false;
  private onGesture = (event: Event) => {
    if (this.gamePaused || (event.target instanceof Element && event.target.closest('[data-action^="music-"]'))) return;
    void this.play(true);
  };

  constructor(private changed: () => void, private isGamePaused: () => boolean) {
    this.audio.preload = 'metadata';
    this.audio.src = TRACKS[0].src;
    this.audio.addEventListener('timeupdate', changed);
    this.audio.addEventListener('loadedmetadata', changed);
    this.audio.addEventListener('play', changed);
    this.audio.addEventListener('pause', changed);
    this.audio.addEventListener('error', changed);
    this.audio.addEventListener('ended', () => this.select(this.index + 1, true));
    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
  }

  get track() { return TRACKS[this.index]; }
  get currentTime() { return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0; }
  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }
  get playing() { return !this.audio.paused && !this.audio.ended; }
  get failed() { return this.audio.error !== null; }
  get trackNumber() { return `${this.index + 1}/${TRACKS.length}`; }

  // Keep the music slider's 100% ceiling equal to the former 30% loudness.
  setVolume(value: number) { this.audio.volume = Math.max(0, Math.min(.3, value)); }

  private async play(fromGesture = false) {
    if (!fromGesture && !this.audio.paused) return;
    try {
      await this.audio.play();
      if (fromGesture) this.removeGestureListeners();
    } catch {
      this.changed();
    }
    this.changed();
  }

  toggle() {
    this.removeGestureListeners();
    if (this.playing) this.audio.pause();
    else void this.play();
  }

  playForPauseMenu() {
    this.removeGestureListeners();
    void this.play(true);
  }

  next() { this.removeGestureListeners(); this.select(this.index + 1, this.playing); }

  previous() {
    this.removeGestureListeners();
    if (this.currentTime > 3) { this.audio.currentTime = 0; this.changed(); return; }
    this.select(this.index - 1, this.playing);
  }

  setGamePaused(paused: boolean) {
    this.gamePaused = paused;
  }

  private select(index: number, autoplay: boolean) {
    this.index = (index + TRACKS.length) % TRACKS.length;
    this.audio.src = this.track.src;
    this.audio.load();
    if (autoplay) void this.play();
    this.changed();
  }

  private removeGestureListeners() {
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
  }

  dispose() {
    this.removeGestureListeners();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
