import * as T from 'three';
import type { ResortSimulation } from './Simulation';

type Feedback = ResortSimulation['feedback'][number];
/** Small synthesized effects: no downloads, audio permissions or persistent state. */
export class ResortGameFeel {
  private context?: AudioContext;
  private abort = new AbortController();
  private effects: { root: T.Group; label: HTMLDivElement; age: number; duration: number; origin: T.Vector3; cash: boolean }[] = [];
  private enabled = true;
  private level = 1;
  setVolume(value: number) { this.level = Math.max(0, Math.min(1, value)); }
  private button = document.createElement('button');
  constructor(private scene: T.Scene, private labels: HTMLElement, private project: (el: HTMLElement, p: T.Vector3) => void) {
    this.button.hidden = true;
    this.button.addEventListener('click', () => { this.enabled = !this.enabled; this.button.textContent = this.enabled ? '♪' : '♪̸'; this.button.setAttribute('aria-label', this.enabled ? 'Sesi kapat' : 'Sesi aç'); if (!this.enabled) void this.context?.suspend().catch(() => {}); else this.unlock(); }, { signal: this.abort.signal });
    window.addEventListener('pointerdown', () => this.unlock(), { signal: this.abort.signal });
    window.addEventListener('keydown', () => this.unlock(), { signal: this.abort.signal });
  }
  private unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume().catch(() => {}); } catch { /* Gameplay remains available without audio. */ }
  }
  private sound(kind: Feedback['kind']) {
    if (!this.enabled || this.level === 0 || this.context?.state !== 'running') return;
    const ctx = this.context, notes = kind === 'build' || kind === 'level' ? [523, 659, 784, 1046] : kind === 'cash' ? [880, 1175, 1397] : kind === 'clean' ? [659, 880] : [587, 784];
    for (const [i, frequency] of notes.entries()) {
      const at = ctx.currentTime + i * .075, oscillator = ctx.createOscillator(), volume = ctx.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, at); volume.gain.linearRampToValueAtTime(.035 * this.level, at + .012); volume.gain.exponentialRampToValueAtTime(.001 * this.level, at + .18);
      oscillator.connect(volume); volume.connect(ctx.destination); oscillator.start(at); oscillator.stop(at + .2); oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    }
  }
  emit(event: Feedback) {
    this.sound(event.kind);
    const origin = new T.Vector3(event.x - 19, .4, event.y - 27), root = new T.Group(); root.position.copy(origin); this.scene.add(root);
    const cash = event.kind === 'cash', big = event.kind === 'build' || event.kind === 'level', count = big ? 16 : cash ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const geometry = cash ? new T.BoxGeometry(.3, .05, .18) : new T.IcosahedronGeometry(.065, 0);
      const material = new T.MeshBasicMaterial({ color: cash ? 0x83df62 : i % 2 ? 0xffd76d : 0xffffff, transparent: true });
      const mesh = new T.Mesh(geometry, material); mesh.userData.angle = i / count * Math.PI * 2; mesh.userData.index = i; root.add(mesh);
    }
    const label = document.createElement('div'); label.className = `reward-pop ${big ? 'big' : ''} ${cash ? 'cash' : ''}`; label.textContent = event.text; label.setAttribute('aria-hidden', 'true'); this.labels.append(label);
    this.effects.push({ root, label, age: 0, duration: big ? 1.8 : 1.2, origin, cash });
    while (this.effects.length > 24) this.remove(this.effects.shift()!);
  }
  update(dt: number, player: T.Vector3) {
    for (const effect of [...this.effects]) {
      effect.age += dt; const p = effect.age / effect.duration;
      for (const object of effect.root.children) {
        const mesh = object as T.Mesh, angle = mesh.userData.angle, radius = Math.sin(p * Math.PI) * 1.1;
        mesh.position.set(Math.cos(angle) * radius, Math.sin(p * Math.PI) * 1.5, Math.sin(angle) * radius);
        if (effect.cash) mesh.position.lerp(player.clone().sub(effect.origin).add(new T.Vector3(0, .9, 0)), p * p);
        mesh.rotation.y = effect.age * 4; (mesh.material as T.MeshBasicMaterial).opacity = 1 - p;
      }
      this.project(effect.label, effect.origin.clone().add(new T.Vector3(0, 1.7 + p, 0))); effect.label.style.opacity = `${Math.min(1, (1 - p) * 3)}`;
      if (p >= 1) { this.remove(effect); this.effects.splice(this.effects.indexOf(effect), 1); }
    }
  }
  private remove(effect: typeof this.effects[number]) { this.scene.remove(effect.root); effect.root.traverse(object => { if (object instanceof T.Mesh) { object.geometry.dispose(); (object.material as T.Material).dispose(); } }); effect.label.remove(); }
  dispose() { this.abort.abort(); this.effects.forEach(e => this.remove(e)); this.effects = []; this.button.remove(); void this.context?.close().catch(() => {}); }
}
