import { initialResort, LEVELS, POOL_UNLOCK_LEVEL, ROOM_DEFS, upgradeCost } from './data';
import { atOffice } from './Office';
import './office-window.css';
import './game-menus.css';
import './stitch-menus.css';
import './quick-controls.css';
import './gameplay-stitch.css';
import './startup-screens.css';
import { resortGoal } from './Guidance';
import { linenCount } from './Linen';
import { ResortSaveService } from './SaveService';
import { ResortSimulation } from './Simulation';
import { requestRewardedAd, type RewardKind } from './RewardedAdService';
import type { Role } from './types';
import type { ResortWorld } from './World';
import { currentLanguage, LANGUAGE_KEY, translate, type GameLanguage } from './i18n';
import { ResortMusic } from './GameMusic';

const roles: Record<Role, string> = { reception: 'Resepsiyon', rooms: 'Oda temizliği + havlu', pool: 'Havuz + limonata + bakım', hauling: 'Çamaşırhane + havuz havluları', bartender: 'Havuz hizmeti' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ONBOARDING_SEEN_KEY = 'olive-coast-onboarding-seen-v1';
type StartupView = 'menu' | 'tutorial';
export class ResortUI {
  world?: ResortWorld;
  private panel = 'village';
  private lastPanel = '';
  private lastMessage = -1;
  private lastXp = -1;
  private lastLevel = -1;
  private adBusy = false;
  private adMuted = false;
  private music: ResortMusic;
  private startupActive = false;
  private startupView: StartupView = 'menu';
  private startupHasSave = false;
  private startupRecovered = false;
  private gameActive = false;
  private settingsOrigin: 'startup' | 'pause' = 'pause';
  language: GameLanguage = currentLanguage();
  private interval: number;
  get canAutosave() { return this.gameActive; }
  private html(selector: string, value: string) { const localized = translate(value, this.language); const el = document.querySelector(selector)!; if (el.innerHTML !== localized) el.innerHTML = localized; }
  constructor(private sim: ResortSimulation, private save: ResortSaveService) {
    this.gameActive = sim.testMode || sim.moneyOnlyMode;
    this.music = new ResortMusic(() => this.renderMusic(), () => this.sim.state.settings.paused);
    document.documentElement.lang = this.language;
    const modeControls = sim.testMode
      ? '<span>∞ TEST MODU · KAYIT YOK</span><button data-action="normal-mode">Normal oyuna dön</button>'
      : sim.moneyOnlyMode
        ? '<span>∞ PARA MODU · KAYIT YOK</span><button data-action="normal-mode">Normal oyuna dön</button>'
        : '<button data-action="test">∞ Sınırsız test modu</button><button data-action="cash-test">∞ Sınırsız para modu</button>';
    document.querySelector('#app')!.innerHTML = translate(`
      <main id="game" aria-label="Tatil köyü haritası"></main>
      <div id="level-card" class="level-card"></div><div id="xp-feedback" class="xp-feedback" aria-live="polite"></div><div id="wallet" class="wallet"></div>
      <div class="mode-controls">${modeControls}</div>
      <div class="quick-controls" aria-label="Oyun kontrolleri"><button data-action="pause" aria-label="Mola menüsünü aç">Ⅱ Mola</button><button id="speed-button" data-action="speed" aria-label="2 kat hız" aria-pressed="false">2× Hız</button><button data-action="reset" aria-label="Oyunu sıfırla">↻ Sıfırla</button></div>
      <div id="reward-timers" class="reward-timers" aria-label="Ödül zamanlayıcıları"></div>
      <div class="resort-toast" id="toast" role="status"></div>
      <div id="joystick" aria-label="Hareket çubuğu"><div id="joystick-knob"></div></div>
      <nav hidden aria-label="Yönetim panelleri"><button data-action="panel" data-panel="village">⌂<small>Köy</small></button><button data-action="panel" data-panel="workers">♙<small>Ekip</small></button><button data-action="panel" data-panel="journey">☆<small>Hedefler</small></button><button data-action="panel" data-panel="help">?<small>Rehber</small></button></nav>
      <div hidden><div id="bag-stat"></div><div id="laundry-stat"></div><div id="time-controls"></div></div>
      <aside id="drawer" class="resort-drawer"><button data-action="close" class="drawer-close" aria-label="Paneli kapat">×</button><div id="drawer-body"></div></aside>
      <dialog id="startup-dialog" class="resort-screen-dialog" aria-label="Olive Coast ana menü"><div id="startup-content"></div></dialog>
      <dialog id="settings-dialog" class="resort-screen-dialog" aria-label="Ayarlar">
        <section class="screen-shell settings-shell">
          <header class="screen-header"><span class="screen-brand-icon">☀</span><div><small>OLIVE COAST</small><h1>Ayarlar</h1></div><button class="screen-close" data-action="return-settings" aria-label="Kapat">×</button></header>
          <div class="settings-content">
            <section class="screen-setting-card"><span class="screen-setting-icon mint">♫</span><div class="screen-setting-copy"><b>Fon müziği</b><small id="settings-track-title">Akdeniz Esintisi</small></div><button class="screen-neutral-button settings-play" data-action="music-toggle" aria-label="Müziği çal">▶</button><label class="screen-range-row"><span>Ses seviyesi</span><input data-setting="music-volume" aria-label="Fon müziği seviyesi" type="range" min="0" max="100" step="1"><output data-volume-output="music">%30</output></label></section>
            <section class="screen-setting-card"><span class="screen-setting-icon amber">◖</span><div class="screen-setting-copy"><b>Ses efektleri</b><small>Oyun içi seslerin seviyesi</small></div><label class="screen-range-row"><span>Ses seviyesi</span><input data-setting="sound-volume" aria-label="Ses efekti seviyesi" type="range" min="0" max="100" step="1"><output data-volume-output="sound">%100</output></label></section>
            <section class="screen-setting-card language-setting-card"><span class="screen-setting-icon mint">文</span><div class="screen-setting-copy"><b>Dil / Language</b><small>Arayüz ve görev metinleri</small></div><div class="language-toggle" aria-label="Dil / Language"><button data-action="language" data-language="tr">Türkçe</button><button data-action="language" data-language="en">English</button></div></section>
            <p class="settings-save-note" id="settings-save-note"></p>
          </div>
          <footer class="screen-footer"><span>Değişiklikler bu cihazda saklanır.</span><button class="screen-primary-button" data-action="return-settings">← &nbsp; Geri</button></footer>
        </section>
      </dialog>
      <dialog id="pause-dialog" class="game-menu">
        <div class="game-menu-frame">
          <header class="game-menu-ribbon"><span>☀ OLIVE COAST</span><span class="menu-status">MOLA ZAMANI</span><button class="pause-close" data-action="resume" aria-label="Oyuna dön">×</button></header>
          <div class="game-menu-content">
            <div class="pause-heading"><span class="pause-emblem">Ⅱ</span><div><small>OYUN DURAKLATILDI</small><h2>Olive Coast: Resort Tycoon</h2><p>Köyün seni bekliyor. Hazır olduğunda kaldığın yerden sürdür.</p></div></div>
            <button data-action="resume" class="menu-continue pause-resume"><span>▶ &nbsp; Oyuna dön</span><kbd>ESC</kbd></button>
            <button data-action="open-settings" class="pause-settings-link">⚙ &nbsp; Ayarlar</button>
            <div class="pause-grid">
              <div class="pause-column">
                <section class="sound-card" aria-label="Ses ayarı"><div class="menu-section-heading"><span>♫</span><b>SES EFEKTLERİ</b><output id="volume-value">%100</output></div><label class="volume-row"><span aria-hidden="true">🔈</span><input id="sound-volume" data-setting="sound-volume" aria-label="Ses efekti seviyesi" type="range" min="0" max="100" step="1"></label></section>
                <section class="music-card" aria-label="Fon müziği">
                  <span class="music-cover" aria-hidden="true">♫</span>
                  <div class="music-player">
                    <div class="music-title-row"><div><b>Fon müziği</b><small id="music-track-name">Akdeniz Esintisi</small></div><span id="music-track-number">1/2</span></div>
                    <div class="music-timeline" role="progressbar" aria-label="Müzik ilerlemesi" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="music-progress"></i></div>
                    <div class="music-controls"><small id="music-current">0:00</small><div><button data-action="music-previous" aria-label="Önceki parça">◀</button><button class="music-play" data-action="music-toggle" aria-label="Müziği çal">▶</button><button data-action="music-next" aria-label="Sonraki parça">▶▶</button></div><small id="music-duration">0:00</small></div>
                    <label class="music-volume-row"><span>♫ <small>Fon müziği seviyesi</small></span><input id="music-volume" data-setting="music-volume" aria-label="Fon müziği seviyesi" type="range" min="0" max="100" step="1"><output id="music-volume-value">%22</output></label>
                  </div>
                </section>
                <div class="language-toggle" aria-label="Dil / Language"><span>🌐 Dil / Language</span><button data-action="language" data-language="tr">Türkçe</button><button data-action="language" data-language="en">English</button></div>
              </div>
              <div class="pause-column">
                <section class="reward-ad-section" aria-label="İsteğe bağlı ödüllü reklamlar"><div class="reward-ad-heading"><span>✦</span><div><b>İsteğe bağlı ödüller</b><small>Ödül simgeleri oyun içinde belirir.</small></div></div><div id="reward-ad-options"></div></section>
                <div class="pause-save"><b>▣ &nbsp;Yerel kayıt</b><small id="pause-save-status">İlerleme bu cihazda otomatik kaydedilir.</small></div>
                <button data-action="reset" class="menu-newgame">↻ &nbsp;Yeni köy kur</button>
              </div>
            </div>
          </div>
          <div id="ad-request-blocker" class="ad-request-blocker" aria-live="polite" hidden><span class="ad-request-spinner">✦</span><b>Reklam hazırlanıyor…</b><small>Bu sırada oyun duraklatıldı.</small></div>
        </div>
      </dialog>
      <dialog id="restart-dialog" class="game-menu restart-menu">
        <div class="game-menu-frame">
          <header class="game-menu-ribbon"><span>☀ OLIVE COAST</span><span class="menu-status">YENİ SAYFA</span></header>
          <div class="game-menu-content restart-content"><span class="restart-emblem">↻</span><small>KÖYÜ YENİDEN KUR</small><h2>Yeni bir başlangıç?</h2><p>${save.recoveryRequired ? `Eski kayıt okunamadığı için otomatik kayıt durduruldu. Sıfırlarsan yeni oyun kaydedilir.${save.recoveryBackupAvailable ? ' Eski kayıt ayrıca yedeklendi.' : ' Eski kayıt şu an yerinde duruyor; ayrıca yedeklenemedi.'}` : save.temporary ? 'Bu deneme baştan başlar. Normal oyun kaydın değişmez.' : 'Mevcut ilerlemen sıfırlanır. Bu karar geri alınamaz.'}</p><div class="menu-actions"><button data-action="cancel-reset" class="menu-continue">Biraz daha kal</button><button data-action="confirm-reset" class="menu-newgame">Sıfırla</button></div></div>
        </div>
      </dialog>`, this.language);
    document.querySelector('#app')!.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (t) this.action(t); });
    document.querySelector('#app')!.addEventListener('input', e => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-setting]');
      if (!input) return;
      const percent = Number(input.value) / 100;
      if (input.dataset.setting === 'sound-volume') this.sim.state.settings.volume = percent;
      if (input.dataset.setting === 'music-volume') this.sim.state.settings.musicVolume = percent * .3;
      this.render();
    });

    this.interval = window.setInterval(() => this.render(), 150); this.render();
    const pause = document.querySelector<HTMLDialogElement>('#pause-dialog')!;
    pause.addEventListener('cancel', e => { e.preventDefault(); if (this.adBusy) return; this.sim.state.settings.paused = false; pause.close(); });
    const startup = document.querySelector<HTMLDialogElement>('#startup-dialog')!;
    startup.addEventListener('cancel', e => {
      e.preventDefault();
      if (this.startupView === 'tutorial') { this.startupView = 'menu'; this.tutorialFirstLaunch = false; this.renderStartupView(); }
    });
    const settings = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
    settings.addEventListener('cancel', e => { e.preventDefault(); this.returnFromSettings(); });
    window.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.repeat || document.querySelector('#restart-dialog[open]')) return;
      if (this.adBusy) { e.preventDefault(); return; }
      if (settings.open) { e.preventDefault(); this.returnFromSettings(); return; }
      if (startup.open) { e.preventDefault(); if (this.startupView === 'tutorial') { this.startupView = 'menu'; this.tutorialFirstLaunch = false; this.renderStartupView(); } return; }
      e.preventDefault();
      const openingPause = !this.sim.state.settings.paused;
      this.sim.state.settings.paused = openingPause;
      if (openingPause) this.music.playForPauseMenu();
      this.render();
    });
  }
  private tutorialFirstLaunch = false;
  showStartMenu(hasSave: boolean, recovered: boolean) {
    if (this.sim.testMode || this.sim.moneyOnlyMode) return;
    this.gameActive = false;
    this.startupActive = true;
    this.startupHasSave = hasSave;
    this.startupRecovered = recovered;
    this.sim.state.settings.paused = true;
    let onboardingSeen = false;
    try { onboardingSeen = localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'; } catch { /* The menu remains usable if storage is blocked. */ }
    this.tutorialFirstLaunch = !hasSave && !recovered && !onboardingSeen;
    this.startupView = this.tutorialFirstLaunch ? 'tutorial' : 'menu';
    if (this.tutorialFirstLaunch) try { localStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* Do not block first play. */ }
    this.renderStartupView();
    document.querySelector<HTMLDialogElement>('#startup-dialog')!.showModal();
    this.render();
  }
  private renderStartupView() {
    const host = document.querySelector<HTMLElement>('#startup-content');
    if (!host) return;
    const content = this.startupView === 'tutorial' ? this.tutorialScreen() : this.mainMenuScreen();
    host.innerHTML = translate(content, this.language);
  }
  private mainMenuScreen() {
    const s = this.sim.state;
    const saveCard = this.startupRecovered
      ? `<aside class="menu-save-card is-warning"><span class="screen-setting-icon amber">!</span><div><b>Kayıt okunamadı</b><p>Eski kayıt korundu. Yeni oyun başlatmadan önceki ilerlemen otomatik silinmez.</p></div></aside>`
      : this.startupHasSave
        ? `<aside class="menu-save-card"><span class="screen-setting-icon mint">▣</span><div><b>Kaldığın yer kayıtlı</b><p>Seviye ${this.sim.level} <span>·</span> Kasa $${Math.floor(s.money).toLocaleString(this.language === 'en' ? 'en-US' : 'tr-TR')}</p><small>İlerleme bu cihazda saklanıyor.</small></div></aside>`
        : `<aside class="menu-save-card"><span class="screen-setting-icon mint">☀</span><div><b>Yeni bir kaçamak seni bekliyor</b><p>Kendi tatil köyünü kur, misafirlerini ağırla ve tesisini geliştir.</p></div></aside>`;
    return `<section class="screen-shell start-shell">
      <header class="screen-header"><span class="screen-brand-icon">☀</span><div><small>OLIVE COAST</small><h1>Resort Tycoon</h1></div><span class="screen-season-badge">Akdeniz'de yeni bir gün</span></header>
      <div class="start-content"><div class="start-copy"><span class="screen-eyebrow">KÜÇÜK BİR EGE HİKÂYESİ</span><h2>Tatil köyün seni bekliyor<span>.</span></h2><p>Misafirlerini ağırla, hizmetlerini büyüt ve kendi Akdeniz kaçamağını kur.</p>
        ${saveCard}
        <div class="start-actions">${this.startupHasSave ? `<button class="screen-primary-button start-continue" data-action="continue-game"><span>▶ &nbsp; Devam Et</span><small>Kaldığın yerden sürdür</small></button>` : ''}<button class="${this.startupHasSave ? 'screen-neutral-button' : 'screen-primary-button'} start-new" data-action="start-new-game">✦ &nbsp; Yeni Oyun</button>
          <div class="start-secondary-actions"><button class="screen-neutral-button" data-action="open-tutorial">▤ &nbsp; Nasıl Oynanır</button><button class="screen-neutral-button" data-action="open-settings" data-origin="startup">⚙ &nbsp; Ayarlar</button></div>
        </div><p class="startup-status" id="startup-status" role="status"></p>
      </div><div class="start-art" aria-hidden="true"><div class="start-sun"></div><div class="start-island"><i></i><i></i><i></i><i></i><span></span></div><div class="start-wave wave-one"></div><div class="start-wave wave-two"></div><span class="start-location">☀ &nbsp; Ege kıyısında, sana ait</span></div></div>
      <footer class="screen-footer"><span>Yerel kayıt · Bu cihazda otomatik saklanır</span><span>Türkçe / English · Ayarlardan değiştirilebilir</span></footer>
    </section>`;
  }
  private tutorialScreen() {
    return `<section class="screen-shell tutorial-shell">
      <header class="screen-header"><span class="screen-brand-icon">☀</span><div><small>OLIVE COAST</small><h1>Nasıl Oynanır</h1></div><button class="screen-close" data-action="tutorial-back" aria-label="Kapat">×</button></header>
      <div class="tutorial-content"><div class="tutorial-intro"><span class="screen-eyebrow">REHBER VE BAŞLANGIÇ</span><h2>Acele yok, tatildesin<span>.</span></h2><p>Oyundaki temel işleri sahneler üzerinden öğren. Her işaretin yanına gidip etkileşim simgesine bas.</p></div>
        <div class="tutorial-steps">
          <article class="tutorial-step"><span class="tutorial-number">01</span><div class="tutorial-visual" aria-hidden="true"><svg viewBox="0 0 340 128"><path class="scene-wall" d="M0 0h340v70H0z"/><path class="scene-floor" d="M0 70h340v58H0z"/><path class="scene-floor-line" d="M0 97h340M75 70v58m110-58v58m105-58v58"/><path class="scene-bed-shadow" d="m66 96 106-42 118 32-110 43z"/><path class="scene-bed-side" d="m69 70 111-39 106 29-108 41z"/><path class="scene-bed-base" d="m69 70 0 17 109 31 108-41V60l-108 41z"/><path class="scene-mattress" d="m77 69 103-36 97 27-102 37z"/><path class="scene-sheet" d="m110 57 69-24 57 16-67 25z"/><path class="scene-pillow" d="m93 65 23-9 19 6-23 9z"/><path class="scene-head" d="M35 58c0-9 7-16 16-16s16 7 16 16v8H35z"/><path class="scene-body" d="M29 69q22-12 43 0l7 24-25 9-27-9z"/><path class="scene-leg" d="m39 96-4 16 10 2 9-15m10-1 8 14 10-5-7-15"/><circle class="scene-interact" cx="239" cy="28" r="17"/><text class="scene-interact-text" x="239" y="33">E</text><path class="scene-arrow" d="m77 43 31 5m-10-10 11 10-13 5"/><path class="scene-spark" d="m177 17 4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/></svg></div><div class="tutorial-step-heading"><span class="tutorial-icon mint">✦</span><h3>Yatağı temizle</h3></div><p>Yatağın hemen yanına yürü ve çıkan etkileşim simgesine bas. Kirli havlu çantana gelir; temiz havlun varsa yatağa serilir.</p></article>
          <article class="tutorial-step"><span class="tutorial-number">02</span><div class="tutorial-visual" aria-hidden="true"><svg viewBox="0 0 340 128"><path class="scene-wall" d="M0 0h340v70H0z"/><path class="scene-floor" d="M0 70h340v58H0z"/><path class="scene-floor-line" d="M0 98h340M80 70v58m110-58v58m105-58v58"/><path class="scene-washer-shadow" d="m151 100 67-25 44 13-67 27z"/><path class="scene-washer-side" d="m163 32 56-20 44 14v62l-56 21-44-18z"/><path class="scene-washer-front" d="m163 32 56-20v62l-56 21z"/><path class="scene-washer-panel" d="m171 38 40-14v9l-40 14z"/><circle class="scene-drum" cx="193" cy="66" r="19"/><circle class="scene-drum-inner" cx="193" cy="66" r="12"/><path class="scene-basket" d="m33 77 48-17 37 12v34l-40 15-45-15z"/><path class="scene-basket-rim" d="m33 77 48-17 37 12-42 17z"/><path class="scene-linen" d="m44 75 20-12 21 7-18 12zm24 10 20-12 18 7-20 12z"/><path class="scene-arrow" d="m113 71 29-11m-13-3 14 3-8 12"/><circle class="scene-interact" cx="230" cy="28" r="16"/><text class="scene-interact-text" x="230" y="33">E</text><path class="scene-spark" d="m286 27 4 8 8 3-8 4-4 8-3-8-9-4 9-3z"/></svg></div><div class="tutorial-step-heading"><span class="tutorial-icon amber">♺</span><h3>Kirlileri makinede yıka</h3></div><p>Kirli çamaşırı kirli sepete bırak. Sonra sepetten alıp makineye koy; yıkama bitince makineyi boşalt.</p></article>
          <article class="tutorial-step"><span class="tutorial-number">03</span><div class="tutorial-visual" aria-hidden="true"><svg viewBox="0 0 340 128"><path class="scene-wall" d="M0 0h340v70H0z"/><path class="scene-floor" d="M0 70h340v58H0z"/><path class="scene-floor-line" d="M0 99h340M85 70v58m112-58v58m100-58v58"/><path class="scene-rack-shadow" d="m76 103 94-34 64 20-97 35z"/><path class="scene-rack-post" d="m92 30 9-3v74l-9 3zm116-40 9-3v74l-9 3z"/><path class="scene-rack-top" d="m92 30 117-42 9 4-117 43z"/><path class="scene-rack-shelf" d="m92 54 117-42 9 4-117 43zm0 24 117-42 9 4-117 43z"/><path class="scene-towel" d="m108 40 17-6v14l-17 6zm26-9 17-6v14l-17 6zm27-9 17-6v14l-17 6zm-51 32 18-6v15l-18 6zm27-10 18-6v15l-18 6zm27-10 18-6v15l-18 6z"/><path class="scene-head" d="M258 60c0-8 6-14 14-14s14 6 14 14v7h-28z"/><path class="scene-body" d="M252 70q20-11 39 0l6 22-24 8-26-8z"/><path class="scene-leg" d="m261 97-5 15 9 2 8-15m9-1 7 14 9-4-6-15"/><circle class="scene-interact" cx="144" cy="19" r="16"/><text class="scene-interact-text" x="144" y="24">E</text><path class="scene-arrow" d="m239 42-27 4m10-9-11 10 12 5"/><path class="scene-spark" d="m64 42 4 8 8 3-8 4-4 8-3-8-9-4 9-3z"/></svg></div><div class="tutorial-step-heading"><span class="tutorial-icon mint">▤</span><h3>Temiz havlu al</h3></div><p>Makineden çıkan temizler rafa eklenir. Temiz rafının yanına gidip havlu al, yatağa taşı ve yatağın yanında etkileşime geç.</p></article>
        </div>
        <section class="tutorial-controls"><div><span class="screen-setting-icon mint">⌘</span><div><b>Kontroller</b><small>Klavyede WASD / ok tuşları · mobilde hareket çubuğu</small></div></div><div><kbd>ESC</kbd><span>Mola menüsü</span><kbd>Fare / dokunma</kbd><span>Yürü ve kamerayı gezdir</span></div></section>
      </div><p class="startup-status tutorial-status" id="startup-status" role="status"></p><footer class="screen-footer"><span>İlerleme bu cihazda otomatik kaydedilir.</span><div>${this.tutorialFirstLaunch ? `<button class="tutorial-skip" data-action="skip-tutorial">Atla</button><button class="screen-primary-button" data-action="tutorial-start">Başlayalım &nbsp; <kbd>ENTER</kbd></button>` : `<button class="screen-primary-button" data-action="tutorial-back">← &nbsp; Geri</button>`}</div></footer>
    </section>`;
  }
  private openSettings(origin: 'startup' | 'pause') {
    this.settingsOrigin = origin;
    if (origin === 'startup') document.querySelector<HTMLDialogElement>('#startup-dialog')!.close();
    document.querySelector<HTMLDialogElement>('#settings-dialog')!.showModal();
    this.render();
  }
  private returnFromSettings() {
    document.querySelector<HTMLDialogElement>('#settings-dialog')!.close();
    if (this.settingsOrigin === 'startup' && this.startupActive) document.querySelector<HTMLDialogElement>('#startup-dialog')!.showModal();
    this.render();
  }
  private enterGame(continueExisting: boolean) {
    if (!continueExisting) {
      const fresh = new ResortSimulation(initialResort(), false, false).state;
      fresh.settings.volume = this.sim.state.settings.volume;
      fresh.settings.musicVolume = this.sim.state.settings.musicVolume ?? .3;
      if (!this.save.replaceWithNewGame(fresh)) {
        const status = document.querySelector<HTMLElement>('#startup-status');
        if (status) status.textContent = translate('Kayıt oluşturulamadı. Tarayıcı depolamasını kontrol edip tekrar dene.', this.language);
        return;
      }
      this.sim.reset();
    }
    this.startupActive = false;
    this.gameActive = true;
    this.sim.state.settings.paused = false;
    document.querySelector<HTMLDialogElement>('#startup-dialog')!.close();
    this.world?.centerPlayer();
    this.render();
  }
  inspect(id: string) { this.panel = 'village'; this.lastPanel = ''; this.render(); document.querySelector('#drawer')!.classList.add('open'); const row = document.querySelector(`[data-facility="${id}"]`); row?.scrollIntoView({ block: 'nearest' }); }
  private action(t: HTMLElement) {
    if (this.adBusy) return;
    switch (t.dataset.action) {
      case 'continue-game': this.enterGame(true); break;
      case 'start-new-game':
        if (this.startupHasSave || this.startupRecovered) document.querySelector<HTMLDialogElement>('#restart-dialog')!.showModal();
        else this.enterGame(false);
        break;
      case 'open-tutorial': this.startupView = 'tutorial'; this.tutorialFirstLaunch = false; this.renderStartupView(); break;
      case 'tutorial-start': case 'skip-tutorial': this.enterGame(false); break;
      case 'tutorial-back': this.startupView = 'menu'; this.tutorialFirstLaunch = false; this.renderStartupView(); break;
      case 'open-settings': this.openSettings(t.dataset.origin === 'startup' || document.querySelector('#startup-dialog[open]') ? 'startup' : 'pause'); break;
      case 'return-settings': this.returnFromSettings(); break;
      case 'resume': if (!this.adBusy) this.sim.state.settings.paused = false; break;
      case 'music-toggle': this.music.toggle(); break;
      case 'music-previous': this.music.previous(); break;
      case 'music-next': this.music.next(); break;
      case 'language': {
        const language = t.dataset.language === 'en' ? 'en' : 'tr';
        if (language !== this.language) { localStorage.setItem(LANGUAGE_KEY, language); location.reload(); }
        break;
      }
      case 'reward-ad': void this.watchRewardedAd(t.dataset.rewardKind as RewardKind); break;
      case 'staff-speed': this.sim.upgradeWorker(t.dataset.worker!); break;
      case 'staff-move': this.sim.upgradeMove(t.dataset.worker!); break;
      case 'staff-carry': this.sim.upgradeCarry(t.dataset.worker!); break;
      case 'laundry-upgrade': this.sim.upgradeLaundry(); break;
      case 'laundry-buy-towels': this.sim.buyLaundryTowels(); break;
      case 'office-tab': this.officeTab = t.dataset.officeTab === 'laundry' ? 'laundry' : 'staff'; this.lastPanel = ''; break;
      case 'panel': this.panel = t.dataset.panel!; this.lastPanel = ''; document.querySelector('#drawer')!.classList.add('open'); break;
      case 'close': document.querySelector('#drawer')!.classList.remove('open'); break;
      case 'goto': this.sim.goToArea(t.dataset.area!); this.world?.centerPlayer(); document.querySelector('#drawer')!.classList.remove('open'); break;


      case 'cancel-job': if (this.sim.state.player.task) this.sim.cancelTask(this.sim.state.player.task); break;
      case 'pause': if (!this.adBusy) { const openingPause = !this.sim.state.settings.paused; this.sim.state.settings.paused = openingPause; if (openingPause) this.music.playForPauseMenu(); } break;
      case 'speed': this.sim.state.settings.speed = this.sim.state.settings.speed === 1 ? 2 : 1; break;
      case 'boost': this.sim.activateBoost(); break;
      case 'test': case 'cash-test': case 'normal-mode': {
        const url = new URL(location.href);
        url.searchParams.delete('test'); url.searchParams.delete('cashTest');
        if (t.dataset.action === 'test') url.searchParams.set('test', '1');
        if (t.dataset.action === 'cash-test') url.searchParams.set('cashTest', '1');
        location.href = url.href; break;
      }
      case 'save': this.sim.notify(this.save.recoveryRequired ? 'Kayıt okunamadı. Eski kayıt korunuyor; yeni oyun seçmeden üzerine yazılmayacak.' : this.save.save(this.sim.state) ? this.save.temporary ? 'Deneme modu normal kaydını değiştirmez.' : 'Tatil köyün kaydedildi.' : 'Kayıt yapılamadı. Tarayıcı depolamasını kontrol et.'); break;
      case 'reset': document.querySelector<HTMLDialogElement>('#restart-dialog')!.showModal(); break;
      case 'cancel-reset': document.querySelector<HTMLDialogElement>('#restart-dialog')!.close(); break;
      case 'confirm-reset': { const fresh = new ResortSimulation(initialResort(this.sim.testMode), this.sim.testMode, this.sim.moneyOnlyMode).state; fresh.settings.volume = this.sim.state.settings.volume; fresh.settings.musicVolume = this.sim.state.settings.musicVolume ?? .3; if (this.save.replaceWithNewGame(fresh)) { this.sim.reset(); this.startupActive = false; this.gameActive = true; this.sim.state.settings.paused = false; document.querySelector<HTMLDialogElement>('#restart-dialog')!.close(); document.querySelector<HTMLDialogElement>('#startup-dialog')!.close(); document.querySelector<HTMLDialogElement>('#settings-dialog')!.close(); document.querySelector<HTMLDialogElement>('#pause-dialog')!.close(); document.querySelector('#drawer')!.classList.remove('open'); this.officeVisited = false; this.world?.centerPlayer(); } else { this.sim.notify('Kayıt yapılamadı; mevcut köyün korunuyor.'); if (this.startupActive) { const status = document.querySelector<HTMLElement>('#startup-status'); if (status) status.textContent = translate('Kayıt oluşturulamadı. Tarayıcı depolamasını kontrol edip tekrar dene.', this.language); } } break; }
    }
    this.render();
  }
  private goal() { return resortGoal(this.sim.state, this.sim.testMode); }
  private renderMusic() {
    const track = document.querySelector<HTMLElement>('#music-track-name');
    if (track) track.textContent = translate(this.music.track.title, this.language);
    const settingsTrack = document.querySelector<HTMLElement>('#settings-track-title');
    if (settingsTrack) settingsTrack.textContent = translate(this.music.track.title, this.language);
    const trackNumber = document.querySelector<HTMLElement>('#music-track-number');
    if (trackNumber) trackNumber.textContent = this.music.trackNumber;
    document.querySelectorAll<HTMLButtonElement>('[data-action="music-toggle"]').forEach(play => {
      play.textContent = this.music.playing ? 'Ⅱ' : '▶';
      play.setAttribute('aria-label', translate(this.music.playing ? 'Müziği duraklat' : 'Müziği çal', this.language));
    });
    if (!track) return;
    document.querySelector<HTMLElement>('#music-current')!.textContent = this.timeLabel(this.music.currentTime);
    document.querySelector<HTMLElement>('#music-duration')!.textContent = this.timeLabel(this.music.duration);
    const progress = this.music.duration ? Math.min(100, this.music.currentTime / this.music.duration * 100) : 0;
    document.querySelector<HTMLElement>('#music-progress')!.style.width = `${progress}%`;
    const timeline = document.querySelector<HTMLElement>('.music-timeline')!;
    timeline.setAttribute('aria-valuenow', String(Math.round(progress)));
    document.querySelector<HTMLElement>('#music-track-number')!.setAttribute('aria-label', this.music.failed ? translate('Müzik yüklenemedi', this.language) : this.music.playing ? translate('Çalıyor', this.language) : translate('Duraklatıldı', this.language));
  }
  private timeLabel(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
  private village() {
    const s = this.sim.state;
    return `<span class="eyebrow">KÜÇÜK BİR EGE HİKÂYESİ</span><h2>Senin tatil köyün<span>.</span></h2><p class="intro">Misafirlerin rahat etsin, sen köyünü büyüt. İşleri beyaz karelerde durarak yap.</p><div class="panel-metrics"><b>${s.stats.stays}<small>Konaklama</small></b><b>${s.stats.poolVisits}<small>Havuz ziyareti</small></b><b>${s.stats.earned}<small>Toplanan para</small></b></div>${s.facilities.map(f => {
      const r = ROOM_DEFS.find(r => r.id === f.id), name = r?.name ?? (f.id === 'reception' ? 'Resepsiyon' : f.id === 'laundry' ? 'Çamaşırhane' : 'Havuz');
      const a = this.sim.areas.find(a => a.target === f.id && a.mode === (f.open ? 'work' : 'buy'));
      const description = !f.open ? `Seviye ${a ? this.sim.requiredLevel(a) : 1} · ${a ? this.sim.cost(a) : 0} para` : f.kind === 'room' ? f.guest ? 'Misafir ağırlanıyor' : f.dirty ? 'Yatağı toparla' : f.floorDirty ? 'Zemini süpür' : f.bathroomDirty ? 'Banyoyu temizle' : f.needsSheet ? 'Temiz çarşaf ve havlu getir' : f.towels ? 'Misafire hazır' : 'Temiz havlu gerekiyor' : f.kind === 'laundry' ? 'Kirliyi bırak → yıka → temizini taşı' : f.cash ? `${f.cash} para kasada` : 'Hizmete hazır';
      return `<article class="facility-row" data-facility="${f.id}"><span class="row-icon">${f.kind === 'room' ? '⌂' : f.kind === 'pool' ? '≈' : f.kind === 'laundry' ? '▣' : '☀'}</span><div><b>${name}</b><small>${description}${f.open ? ' · Sv. ' + f.level : ''}</small></div>${a ? `<button data-action="goto" data-area="${a.id}">${f.open ? 'Git' : 'Alanı bul'}</button>` : ''}</article>`;
    }).join('')}${this.sim.facility('pool').open ? `<article class="facility-row"><span class="row-icon">🍋</span><div><b>Havuz barı</b><small>${s.bar?.open ? 'Limonata servisi · ' + s.bar.cash + ' ₺ kasada' : '200 ₺ karşılığında aç'}</small></div><button data-action="goto" data-area="${s.bar?.open ? 'barPrepare' : 'barBuy'}">Git</button></article>` : ''}<div class="coming-soon"><b>İleride köye katılacaklar</b><p>Restoran · Spa · Plaj hizmetleri · Otopark</p><small>Bu sürümde kapalı; henüz satın alınamaz.</small></div>`;
  }
  private async watchRewardedAd(kind: RewardKind) {
    if (this.adBusy || !this.sim.state.settings.paused) return;
    this.adBusy = true; this.render();
    const result = await requestRewardedAd(kind, () => { this.adMuted = true; this.world?.setVolume(0); });
    this.adMuted = false; this.adBusy = false;
    if (result === 'completed') {
      if (!this.sim.grantRewardedAd(kind)) this.sim.notify('Ödülün süresi dolmuş veya bu bonus şu an kullanılamıyor.');
    } else if (result === 'unavailable') this.sim.notify('Bu sürümde reklam sağlayıcısı bağlı değil. CrazyGames sürümünde veya Google Play uygulamasında deneyebilirsin.');
    else this.sim.notify('Reklam tamamlanamadı; ödül verilmedi. Biraz sonra tekrar deneyebilirsin.');
    this.render();
  }
  requestRewardFromMap(kind: RewardKind) {
    if (this.adBusy) return;
    this.sim.state.settings.paused = true;
    this.render();
    void this.watchRewardedAd(kind);
  }
  private rewardAdOptions() {
    const s = this.sim.state;
    const rows = ([['boost', '▱', 'Kaykay boostu', '90 sn boyunca %50 hız'], ['money', '$', 'Kasa bonusu', '$100 oyun parası']] as const).map(([kind, glyph, title, subtitle]) => {
      const active = kind === 'boost' && s.boost.remaining > 0;
      return `<article class="reward-ad-row"><span class="reward-ad-icon ${kind}">${kind === 'boost' ? '<img src="/assets/icons/skateboard-outline-generated.png" alt="">' : glyph}</span><div><b>${title}</b><small>${subtitle}</small></div>${active ? `<strong>${Math.ceil(s.boost.remaining)} sn aktif</strong>` : ''}</article>`;
    }).join('');
    return `${rows}<p class="reward-provider-status">Reklamlar yalnızca haritadaki simgelerden açılır.</p>`;
  }
  private workers() {
    const s = this.sim.state;
    return `<span class="eyebrow">EKİBİN</span><h2>Herkes kendi işinde<span>.</span></h2><p class="intro">İlgili bölümün yanındaki yeşil personel simgesinde durarak işe al. Çalışan kendi bölümünde otomatik çalışır.</p>${s.workers.map(w => `<article class="worker-card"><div class="worker-header"><b>♙ ${esc(w.name)}</b><small>${roles[w.role]}</small></div><p>${esc(w.status)}</p></article>`).join('')}${!s.workers.length ? '<p class="empty">Resepsiyon, odalar, çamaşırhane ve havuz yakınındaki personel simgelerini kullan.</p>' : ''}`;
  }
  private journey() {
    const s = this.sim.state, goals = [['İlk misafiri karşıla', s.stats.welcomed > 0], ['İlk konaklamayı tamamla', s.stats.stays > 0], ['İlk odayı temizle', s.stats.cleaned > 0], ['Kirli havluyu yıka', s.stats.washed > 0], ['İkinci odayı aç', this.sim.facility('room2').open], ['İlk çalışanı al', s.workers.length > 0], ['Havuzu aç', this.sim.facility('pool').open], ['İlk havuz hizmetini tamamla', s.stats.poolVisits > 0], ['Altı odayı aç', ROOM_DEFS.every(r => this.sim.facility(r.id).open)]];
    const levelReward = (i: number) => i === 0 ? 'Başlangıç' : i <= 5 ? `Oda ${i + 1}${i === 1 ? ' + çalışanlar' : ''}` : i + 1 === POOL_UNLOCK_LEVEL ? 'Havuz erişimi' : 'Oyuncu hız ve iş verimi';
    return `<span class="eyebrow">BÜYÜK BİR KAÇAMAĞA DOĞRU</span><h2>Küçük adımlar<span>.</span></h2><p class="intro">Müşteri kabulü +10, oda temizliği +5, havuz hizmeti +5 XP.</p>${goals.map(([title, done]) => `<div class="goal-row ${done ? 'done' : ''}"><span>${done ? '✓' : '○'}</span>${title}</div>`).join('')}<h3>Seviye açılışları</h3>${LEVELS.map((xp, i) => `<p class="unlock-line">⭐ ${i + 1}. seviye · ${xp} XP · ${levelReward(i)}</p>`).join('')}`;
  }
  private help() {
    const saveStatus = this.save.recoveryRequired ? `Kayıt okunamadı. Eski kayıt korunuyor; otomatik kayıt duraklatıldı.${this.save.recoveryBackupAvailable ? ' Kurtarma kopyası oluşturuldu.' : ''}` : this.save.temporary ? 'Deneme modu ilerlemesi kaydedilmez; normal oyun kaydın korunur.' : `15 saniyede otomatik kayıt · ${this.save.lastSaved || 'Henüz kayıt yok'}. Çevrimdışı gelir yok.`;
    return `<span class="eyebrow">NASIL OYNANIR?</span><h2>Acele yok, tatildesin<span>.</span></h2><ol class="help-list"><li>Beyaz resepsiyon karesinde dur. Misafir varsa hazır bir odaya yerleşir.</li><li>Misafir karşılanınca para toplama noktasında ücret birikir. Yanına yürüyerek topla.</li><li>Yatak simgesine yürü: yatağın herhangi bir kenarında durarak çarşafları topla. Kirli havlu ve çarşaf çantana alınır; ikisi de sepete taşınıp makinede yıkanır. Temiz çarşafı raftan alıp yatağa geri getir. Süpürge simgesinin alanında zemini ayrıca temizle.</li><li>Kirli havlu sepetine yaklaş; havlular otomatik bırakılır. Makine kendisi yıkar.</li><li>Temiz havlu rafına yaklaşarak havlu al; odanın karesinde durarak bırak. Bir oda için gereken temiz çarşaf alınır; toplam çanta kapasitesi sekiz parçadır.</li><li>Makine kapasitesini yükseltmek veya temiz havlu satın almak için işletme ofisini kullan.</li><li>Yeşil alan yeni tesis açar, sarı alan mevcut tesisi yükseltir. 1,3 saniye bekle; yeniden satın almak için ayrılıp dön.</li><li>Havuzu açınca konaklayan misafirler yer varsa havuza gider. Girişte karşıla, rafta havlu bulundur ve şezlongları temizle.</li></ol><p>Havuz barını 200 ₺’ye aç. Bardak simgesindeki misafire limonata hazırlayıp tepsiyle götür; teslim başına 15 ₺ bar kasasına gelir. Dört havuz ziyareti sonrası yeni girişler bakım için durur; kepçe simgesine veya havuzun kenarına yaklaşarak temizle. Bar yanında barmen alabilirsin.</p><h3>Kontroller</h3><p>WASD / oklar veya mobil hareket çubuğu. Yere ve kare etiketine dokunarak yürü. Etkileşim tuşu yok.</p><p>Boşluk: duraklat. Tekerlek / iki parmak: yakınlaştır. Sürükle: kamerayı gezdir.</p><p>Bir işi yarıda bırakınca aynı kareye dönerek devam edebilirsin. Rehberdeki görevi bırak düğmesi görev rezervasyonunu serbest bırakır.</p>${this.sim.state.player.task ? '<button data-action="cancel-job">Geçerli görevi bırak</button>' : ''}<button class="primary" data-action="save">Şimdi kaydet</button><p class="muted">${saveStatus}</p><button class="danger" data-action="reset">Yeni tatil köyü kur</button>`;
  }
  private officeVisited = false;
  private officeTab: 'staff' | 'laundry' = 'staff';
  private office() {
    const workers = this.sim.state.workers, laundry = this.sim.facility('laundry');
    const skill = (name: string, stat: string, action: string, id: string, level: number, cost: number, glyph: string) => `
      <div class="office-skill">
        <div class="office-skill-info"><span class="office-skill-icon">${glyph}</span><span><b>${name}</b><small>${stat}</small></span><strong>${level}/3</strong></div>
        <div class="office-meter" aria-label="Seviye ${level} / 3">${[1, 2, 3].map(step => `<i class="${step <= level ? 'lit' : ''}"></i>`).join('')}</div>
        <button data-action="${action}" data-worker="${id}" ${level >= 3 ? 'disabled' : ''}>${level >= 3 ? 'EN İYİ SEVİYE' : `Geliştir <span>${this.sim.testMode ? 'Ücretsiz' : cost + ' ₺'}</span>`}</button>
      </div>`;
      return `
        <header class="office-banner"><div><small>☀ OLIVE COAST</small><h2>İşletme ofisi</h2><p>Ekibinin gelişimini ve çamaşırhaneyi buradan yönet.</p></div><span class="office-team-count"><b>${workers.length}</b><small>ÇALIŞAN</small></span></header>
        <nav class="office-tabs" aria-label="Ofis bölümleri"><button data-action="office-tab" data-office-tab="staff" aria-current="${this.officeTab === 'staff' ? 'page' : 'false'}">♙ &nbsp;Ekip yükseltmeleri</button><button data-action="office-tab" data-office-tab="laundry" aria-current="${this.officeTab === 'laundry' ? 'page' : 'false'}">▣ &nbsp;Çamaşırhane</button></nav>
        <div class="office-section" ${this.officeTab !== 'laundry' ? 'hidden' : ''}>
        <article class="office-worker office-department">
          <header class="office-worker-head"><span class="office-avatar">▣</span><span class="office-worker-name"><b>Çamaşırhane</b><small>Makine ve temiz havlu tedariki</small></span><span class="office-rank">SV. ${laundry.level}</span></header>
          <div class="office-skills">
            <div class="office-skill">
              <div class="office-skill-info"><span class="office-skill-icon">◉</span><span><b>Makine kapasitesi</b><small>Tek seferde ${this.sim.machineCapacity} parça yıkar</small></span><strong>${laundry.level}/3</strong></div>
              <div class="office-meter" aria-label="Seviye ${laundry.level} / 3">${[1, 2, 3].map(step => `<i class="${step <= laundry.level ? 'lit' : ''}"></i>`).join('')}</div>
              <button data-action="laundry-upgrade" ${laundry.level >= 3 ? 'disabled' : ''}>${laundry.level >= 3 ? 'EN İYİ SEVİYE' : `Geliştir <span>${this.sim.testMode ? 'Ücretsiz' : upgradeCost('laundry', laundry.level) + ' ₺'}</span>`}</button>
            </div>
            <div class="office-skill">
              <div class="office-skill-info"><span class="office-skill-icon">▱</span><span><b>Temiz havlu satın al</b><small>${this.sim.laundryTowelPackSize ? this.sim.laundryTowelPackSize + ' havlu doğrudan temiz rafa eklenir' : 'Temiz raf kapasitesi dolu'}</small></span><strong>${this.sim.testMode ? '∞' : this.sim.state.laundry.clean}/${this.sim.shelfCapacity}</strong></div>
              <div class="office-meter" aria-label="Temiz raf doluluğu">${[1, 2, 3].map(step => `<i class="${this.sim.state.laundry.clean / this.sim.shelfCapacity >= step / 3 ? 'lit' : ''}"></i>`).join('')}</div>
              <button data-action="laundry-buy-towels" ${!this.sim.laundryTowelPackSize ? 'disabled' : ''}>${!this.sim.laundryTowelPackSize ? 'RAF DOLU' : `Satın al <span>${this.sim.testMode ? 'Ücretsiz' : this.sim.laundryTowelPackCost + ' ₺'}</span>`}</button>
            </div>
          </div>
        </article>
        </div>
        <div class="office-section" ${this.officeTab !== 'staff' ? 'hidden' : ''}>
        <div class="office-roster"><span>EKİP LİSTESİ</span><small>Gelişim hemen etkili olur</small></div>
        <div class="office-worker-grid">
      ${workers.map(w => `
        <article class="office-worker">
          <header class="office-worker-head"><span class="office-avatar">${esc(w.name[0].toUpperCase())}</span><span class="office-worker-name"><b>${esc(w.name)}</b><small>${roles[w.role]}</small></span><span class="office-rank">SV. ${w.level}</span></header>
          <div class="office-skills ${w.role === 'reception' ? 'single' : ''}">
            ${skill('Hizmet hızı', 'Görevleri daha hızlı tamamlar', 'staff-speed', w.id, w.level, 120 * w.level, '☀')}
            ${w.role !== 'reception' ? skill('Yürüyüş', 'Daha hızlı hareket', 'staff-move', w.id, w.moveLevel ?? 1, 100 * (w.moveLevel ?? 1), '➜') + skill('Taşıma', (w.carryLevel ?? 1) + ' havlu kapasitesi', 'staff-carry', w.id, w.carryLevel ?? 1, 100 * (w.carryLevel ?? 1), '▱') : ''}
          </div>
        </article>`).join('') || '<div class="office-empty"><span>♙</span><b>Ekip henüz kurulmadı</b><p>Önce köydeki yeşil personel simgelerinden bir çalışan al.</p></div>'}
        </div></div>
      <footer class="office-footer"><span>✦</span> Her yükseltme iş başında hemen etkisini gösterir.</footer>`;
  }
  render() {
    const pause = document.querySelector<HTMLDialogElement>('#pause-dialog')!;
    const blockingScreenOpen = !!document.querySelector('#startup-dialog[open], #settings-dialog[open]');
    if (this.gameActive && this.sim.state.settings.paused && !pause.open && !blockingScreenOpen && !document.querySelector('#restart-dialog[open]')) pause.showModal();
    if (!this.sim.state.settings.paused && pause.open) pause.close();
    const volume = this.sim.state.settings.volume ?? 1;
    const musicVolume = Math.max(0, Math.min(.3, this.sim.state.settings.musicVolume ?? .3));
    this.music.setVolume(this.adMuted ? 0 : musicVolume);
    this.music.setGamePaused(this.sim.state.settings.paused);
    this.renderMusic();
    this.world?.setVolume(this.adMuted ? 0 : volume);
    document.querySelectorAll<HTMLInputElement>('[data-setting="sound-volume"]').forEach(input => { input.value = String(Math.round(volume * 100)); });
    document.querySelectorAll<HTMLElement>('[data-volume-output="sound"]').forEach(output => { output.textContent = '%' + Math.round(volume * 100); });
    document.querySelector<HTMLElement>('#volume-value')!.textContent = '%' + Math.round(volume * 100);
    const musicVolumePercent = Math.round(musicVolume / .3 * 100);
    document.querySelectorAll<HTMLInputElement>('[data-setting="music-volume"]').forEach(input => { input.value = String(musicVolumePercent); });
    document.querySelectorAll<HTMLElement>('[data-volume-output="music"]').forEach(output => { output.textContent = '%' + musicVolumePercent; });
    document.querySelector('#music-volume-value')!.textContent = '%' + musicVolumePercent;
    const settingsNote = document.querySelector<HTMLElement>('#settings-save-note');
    if (settingsNote) settingsNote.textContent = translate(this.save.temporary ? 'Bu modda ayarlar oyun kaydına yazılmaz.' : 'Ses ve dil tercihleri bu tarayıcıdaki yerel kayda bağlıdır.', this.language);
    document.querySelector<HTMLElement>('#pause-save-status')!.textContent = translate(
      this.save.recoveryRequired ? 'Kayıt okunamadı; eski kayıt korunuyor.' : this.save.temporary ? 'Deneme modunda kayıt yapılmaz.' : 'İlerleme bu cihazda otomatik kaydedilir.',
      this.language,
    );
    document.querySelectorAll<HTMLButtonElement>('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === this.language));
    });
    const speedButton = document.querySelector<HTMLButtonElement>('#speed-button');
    if (speedButton) {
      const fast = this.sim.state.settings.speed === 2;
      speedButton.textContent = fast ? '2× Hız · Açık' : '2× Hız';
      speedButton.setAttribute('aria-pressed', String(fast));
      speedButton.setAttribute('aria-label', fast ? 'Normal hıza dön' : '2 kat hız');
    }
    const p = this.sim.state.player, nearbyOffice = atOffice(p) && !p.path.length;
    document.querySelector('#drawer')!.classList.toggle('office-window', nearbyOffice || this.panel === 'office');
    if (nearbyOffice && !this.officeVisited) { this.panel = 'office'; this.lastPanel = ''; document.querySelector('#drawer')!.classList.add('open'); }
    if (!nearbyOffice && this.panel === 'office') document.querySelector('#drawer')!.classList.remove('open');
    this.officeVisited = nearbyOffice;
    const s = this.sim.state, level = this.sim.level, base = LEVELS[level - 1], end = LEVELS[level];
    const levelCard = document.querySelector<HTMLElement>('#level-card')!;
    levelCard.classList.toggle('is-max', !end);
    if (this.lastLevel > 0 && level > this.lastLevel) {
      levelCard.classList.remove('level-up');
      void levelCard.offsetWidth;
      levelCard.classList.add('level-up');
      window.setTimeout(() => levelCard.classList.remove('level-up'), 1200);
    }
    this.lastLevel = level;
    this.html('#wallet', `<div class="wallet-copy"><small>KASA</small><b>$${this.sim.unlimitedMoney ? '∞' : Math.floor(s.money).toLocaleString(this.language === 'en' ? 'en-US' : 'tr-TR')}</b></div>`);
    const levelProgress = end ? Math.min(100, (s.xp - base) / (end - base) * 100) : 100;
    const xpLabel = end ? `${s.xp - base}/${end - base} XP` : 'MAX';
    this.html('#level-card', `<span class="level-star" aria-label="Seviye ${level}"><i>★</i><b>${level}</b></span><div class="xp-track" aria-label="${xpLabel}"><i style="width:${levelProgress}%"></i><b>${xpLabel}</b></div>`);
    const rewardState = s.rewardedAds;
    const rewardCards: string[] = [];
    if (s.boost.remaining > 0) rewardCards.push(`<div class="reward-timer-marker" aria-label="Kaykay boostu: ${Math.ceil(s.boost.remaining)} saniye"><span class="reward-timer-icon boost"><img src="/assets/icons/skateboard-outline-generated.png" alt=""></span><small>${Math.ceil(s.boost.remaining)} sn</small></div>`);
    else if (rewardState && rewardState.boost.activeUntil > s.elapsed) rewardCards.push(`<div class="reward-timer-marker" aria-label="Kaykay boostu: ${Math.ceil(rewardState.boost.activeUntil - s.elapsed)} saniye"><span class="reward-timer-icon boost"><img src="/assets/icons/skateboard-outline-generated.png" alt=""></span><small>${Math.ceil(rewardState.boost.activeUntil - s.elapsed)} sn</small></div>`);
    if (rewardState && rewardState.money.activeUntil > s.elapsed) rewardCards.push(`<div class="reward-timer-marker" aria-label="Para ödülü: ${Math.ceil(rewardState.money.activeUntil - s.elapsed)} saniye"><span class="reward-timer-icon money">$</span><small>${Math.ceil(rewardState.money.activeUntil - s.elapsed)} sn</small></div>`);
    this.html('#reward-timers', rewardCards.join(''));
    if (this.lastXp < 0) this.lastXp = s.xp;
    else if (s.xp > this.lastXp) {
      const gain = s.xp - this.lastXp, pop = document.createElement('span');
      pop.className = 'xp-gain-pop'; pop.textContent = `+${gain} XP`; pop.setAttribute('aria-label', `+${gain} XP`);
      document.querySelector('#xp-feedback')!.append(pop);
      window.setTimeout(() => pop.remove(), 1800);
      this.lastXp = s.xp;
    } else if (s.xp < this.lastXp) this.lastXp = s.xp;
    this.html('#bag-stat', `<span>☀ ${s.player.bag.clean} <small>temiz</small></span><span>♺ ${s.player.bag.dirty} <small>kirli</small></span><span>▱ ${s.player.bag.cleanSheets ?? 0}/${s.player.bag.dirtySheets ?? 0} <small>temiz/kirli çarşaf</small></span><small>${s.player.drink ? '<span>🍋 <small>limonata</small></span>' : ''}ÇANTA ${linenCount(s.player.bag)}/${this.sim.bagCapacity}</small>`);
    this.html('#laundry-stat', `<span>▣ ${this.sim.testMode ? '∞' : s.laundry.clean}<small>temiz raf</small></span><span>${s.laundry.dirty}<small>havlu yıkanacak</small></span><span>▱ ${s.laundry.cleanSheets ?? 0}/${s.laundry.dirtySheets ?? 0}<small>temiz/kirli çarşaf</small></span>`);
    this.html('#time-controls', `<button data-action="pause" aria-label="${s.settings.paused ? 'Devam et' : 'Duraklat'}">${s.settings.paused ? '▶' : 'Ⅱ'}</button><button data-action="speed" aria-label="Oyun hızı">${s.settings.speed}×</button>`);
    this.html('#reward-ad-options', this.rewardAdOptions());
    document.querySelector<HTMLElement>('#ad-request-blocker')!.hidden = !this.adBusy;
    const html = this.panel === 'office' ? this.office() : this.panel === 'workers' ? this.workers() : this.panel === 'journey' ? this.journey() : this.panel === 'help' ? this.help() : this.village();
    if (html !== this.lastPanel && document.activeElement?.tagName !== 'SELECT') { document.querySelector('#drawer-body')!.innerHTML = html; this.lastPanel = html; }
    if (this.lastMessage !== this.sim.messageId) { const id = this.sim.messageId; this.lastMessage = id; const t = document.querySelector('#toast')!; t.textContent = translate(this.sim.message, this.language); t.classList.add('show'); window.setTimeout(() => { if (id === this.sim.messageId) t.classList.remove('show'); }, 4500); }
  }
  dispose() { clearInterval(this.interval); this.music.dispose(); }
}
