import { BAG_CAPACITY, BUILDINGS, CHAPTERS, RESOURCE_IDS, RESOURCES } from './game/data';
import { count, has, Simulation, initialState } from './game/Simulation';
import type { BuildingKind, Inventory, Resource } from './game/types';
import { SaveService } from './game/SaveService';
import { SimulatedRewardedBoostService } from './game/RewardedBoostService';
import type { World3D as WorldScene } from './game/World3D';
import { ROOMS, roomForKind, roomAt, LEVEL_XP } from './game/facility';

export function icon(name: string) {
  const paths: Record<string, string> = {
    leaf: '<path d="M20 4c-7-1-15 2-15 9a6 6 0 0 0 6 6c7 0 9-8 9-15Z"/><path d="m4 21 12-12M10 15v-5m0 5h5"/>',
    city: '<path d="M3 21h18M5 21V9l5-3v15m0-15V3h8v18M7 12h1m-1 4h1m5-9h2m-2 4h2m-2 4h2"/>',
    build: '<path d="m14 5 5 5M3 21l5-1L20 8a3 3 0 0 0-4-4L4 16l-1 5Z"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    flag: '<path d="M5 21V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
    pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="m8 4 12 8-12 8V4Z"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>', bag: '<path d="M5 8h14l2 13H3L5 8Zm3 0V6a4 4 0 0 1 8 0v2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', save: '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>', rotate: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
    box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5m-9 5v9m-5-16 10 5"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.leaf}</svg>`;
}
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const limit = (capacity: number) => Number.isFinite(capacity) ? String(capacity) : '∞';
const items = (inventory: Inventory) => RESOURCE_IDS.filter(r => (inventory[r] ?? 0) > 0).map(r => `<span class="item-token">${RESOURCES[r].icon} ${inventory[r]} <span>${RESOURCES[r].name}</span></span>`).join('');
type Panel = 'overview' | 'building' | 'build' | 'workers' | 'campaign' | 'help' | 'bag';

export class UI {
  scene?: WorldScene;
  private panel: Panel = 'overview';
  private selected?: string;
  private lastMessageId = -1;
  private lastPanelHTML = '';
  private boostBusy = false;
  private reward = new SimulatedRewardedBoostService();
  constructor(private sim: Simulation, private save: SaveService) {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <header class="topbar">
        <a class="brand" href="#" aria-label="Çöpten Şehre"> <span class="brand-icon">${icon('leaf')}</span><span>Çöpten<span class="brand-second">Şehre<span class="brand-dot">.</span></span></span></a>
        <div class="world-heading"><span class="live-dot"></span><span>Yenihayat <small>BAŞLANGIÇ MAHALLESİ</small></span></div>
        <div id="top-stats" class="top-stats"></div>
      </header>
      <nav class="rail" aria-label="Oyun panelleri">
        ${[['overview', 'city', 'Mahalle'], ['build', 'build', 'İnşa'], ['workers', 'team', 'Ekip'], ['campaign', 'flag', 'Yolculuk']].map(([panel, glyph, label]) => `<button class="nav-button ${panel === 'overview' ? 'active' : ''}" data-action="panel" data-panel="${panel}" title="${label}">${icon(glyph)}<span>${label}</span></button>`).join('')}
        <div class="rail-bottom"><button class="nav-button" data-action="manual-save" title="Kaydet">${icon('save')}<span>Kaydet</span></button><button class="nav-button" data-action="panel" data-panel="help" title="Nasıl oynanır">${icon('help')}<span>Rehber</span></button></div>
      </nav>
      <main class="world-area"><div id="game" aria-label="3D tycoon mahallesi"></div>
        <div class="map-label"><span>BÖLÜM 01</span><h1>Yeni bir başlangıç</h1><p>Küçük adımlar. Büyük bir döngü.</p></div>
        <div class="map-badge">${icon('leaf')} <span>Birlikte daha yeşil.</span></div>
        <div class="camera-controls"><button data-action="zoom-in" aria-label="Yakınlaştır">${icon('plus')}</button><button data-action="zoom-out" aria-label="Uzaklaştır">${icon('minus')}</button><span></span><button data-action="center" aria-label="Karaktere odaklan">${icon('target')}</button><button data-action="fit" aria-label="Tüm haritayı göster">${icon('city')}</button></div>
        <div id="placement-hint"></div>
        <div id="station-actions" class="station-actions"></div>
        <div class="test-controls">${sim.testMode ? '<span>∞ TEST MODU · KAYIT YOK</span><button data-action="test-toggle">Normal oyuna dön</button>' : '<button data-action="test-toggle">Sınırsız test modu</button>'}</div>
        <div id="toast" class="toast" role="status" aria-live="polite"></div>
        <div class="touch-controls"><div id="joystick" aria-label="Hareket çubuğu"><div id="joystick-knob"></div></div><div class="auto-work-status" role="status"></div></div>
      </main>
      <aside class="sidepanel" aria-label="Yönetim paneli"><button class="drawer-close icon-button" data-action="close-panel" aria-label="Paneli kapat">${icon('close')}</button><div id="panel-body"></div></aside>
      <footer class="bottom-bar"><div class="stock-title">${icon('box')}<span>DEPO<small id="stock-count"></small></span></div><div id="stock-strip" class="stock-strip"></div><button data-action="panel" data-panel="bag" class="bag-button">${icon('bag')}<span>Çanta<small id="bag-count"></small></span></button><div id="time-controls" class="time-controls"></div></footer>
      <dialog id="reset-dialog"><span class="eyebrow">YENİ BAŞLANGIÇ</span><h2>Mahalleni sıfırlayalım mı?</h2><p>Bu tarayıcıdaki oyun ilerlemen silinir ve başlangıç mahallesi yeniden açılır.</p><div class="button-row"><button data-action="cancel-reset" class="button secondary">Vazgeç</button><button data-action="confirm-reset" class="button danger">Yeni oyun</button></div></dialog>`;
    document.querySelector('#app')!.addEventListener('click', e => {
      const target = (e.target as Element).closest<HTMLElement>('[data-action]');
      if (target) { e.preventDefault(); this.action(target.dataset.action!, target); }
    });
    document.querySelector('#app')!.addEventListener('change', e => {
      const target = e.target as HTMLSelectElement;
      if (target.dataset.worker) { this.sim.assign(target.dataset.worker, target.value); target.blur(); this.render(); }
    });
    this.setupJoystick();
    this.render();
    window.setInterval(() => this.render(), 250);
  }
  select(id: string) { const changed = this.selected !== id || this.panel !== 'building'; this.selected = id; this.panel = 'building'; document.querySelector('#app')!.classList.add('panel-open'); this.render(); if (changed) document.querySelector('.sidepanel')!.scrollTop = 0; }
  private setPanel(panel: Panel) {
    document.querySelector('#app')!.classList.add('panel-open');
    this.panel = panel;
    if (panel !== 'build' && this.scene) this.scene.buildMode = undefined;
    this.render();
    document.querySelector('.sidepanel')!.scrollTop = 0;
  }
  private buildingLabel(id: string) {
    const b = this.sim.building(id)!;
    const same = this.sim.state.buildings.filter(other => other.kind === b.kind);
    return `${BUILDINGS[b.kind].name}${same.length > 1 ? ` ${same.findIndex(other => other.id === id) + 1}` : ''}`;
  }
  interact() {
    const b = this.sim.state.buildings.filter(b => this.sim.nearby(b)).sort((a, b) => a.id === this.selected ? -1 : b.id === this.selected ? 1 : 0)[0];
    if (!b) { const room = ROOMS.find(r => !this.sim.roomOpen(r.id) && Math.hypot(this.sim.state.player.x - r.gate.x, this.sim.state.player.y - r.gate.y) < 1.2); if (room) this.sim.unlockRoom(room.id); else this.sim.notify('Bir çalışma noktasına yaklaş. Odalara girip E ile çalışabilirsin.'); this.render(); return; }
    this.selected = b.id; this.panel = 'building'; if (this.scene) this.scene.selected = b.id;
    if (b.kind === 'warehouse') this.sim.deposit(b.id);
    else if (b.kind === 'shop') this.sim.deliverContract(b.id);
    else if (b.kind === 'home') this.sim.serveHome(b.id);
    else if (count(b.output)) this.sim.collect(b.id);
    else if (b.job?.owner === 'player') this.sim.resumeJob(b.id);
    else this.sim.startJob(b.id);
    this.render();
  }
  private async action(action: string, target: HTMLElement) {
    const id = target.dataset.id ?? this.selected ?? '';
    switch (action) {
      case 'test-toggle': { const url = new URL(location.href); if (this.sim.testMode) url.searchParams.delete('test'); else url.searchParams.set('test', '1'); location.href = url.href; break; }
      case 'inspect': this.select(id); break;
      case 'room-goto': { const room = ROOMS.find(r => r.id === target.dataset.room)!; this.sim.goTo(room.gate); this.scene?.centerPlayer(); document.querySelector('#app')!.classList.remove('panel-open'); break; }
      case 'panel': this.setPanel(target.dataset.panel as Panel); break;
      case 'close-panel': document.querySelector('#app')!.classList.remove('panel-open'); this.selected = undefined; if (this.scene) { this.scene.selected = undefined; this.scene.buildMode = undefined; } break;
      case 'work': { const b = this.sim.building(id); if (b?.job?.owner === 'player') { if (!this.sim.resumeJob(id)) { this.sim.goToBuilding(id); this.sim.notify('Görevine devam etmek için binaya gidiyorsun.'); } } else this.sim.startJob(id); break; }
      case 'collect': this.sim.collect(id); break;
      case 'deposit': this.sim.deposit(id); break;
      case 'take': this.sim.take(id, target.dataset.resource as Resource); break;
      case 'goto': this.sim.goToBuilding(id); break;
      case 'next-station': {
        const kind = target.dataset.kind as BuildingKind;
        const station = this.sim.state.buildings.find(b => b.kind === kind);
        if (station) { this.select(station.id); if (this.scene) this.scene.selected = station.id; this.sim.goToBuilding(station.id); }
        break;
      }
      case 'depot': { const depot = this.sim.state.buildings.find(b => b.kind === 'warehouse')!; this.select(depot.id); if (this.scene) this.scene.selected = depot.id; this.sim.goToBuilding(depot.id); break; }
      case 'contract': this.sim.deliverContract(id); break;
      case 'contract-goto': { const shop = this.sim.state.buildings.find(b => b.kind === 'shop')!; this.select(shop.id); if (this.scene) this.scene.selected = shop.id; this.sim.goToBuilding(shop.id); break; }
      case 'serve': this.sim.serveHome(id); break;
      case 'hire': this.sim.hire(); break;
      case 'worker-upgrade': this.sim.upgradeWorker(id); break;
      case 'building-upgrade': this.sim.upgradeBuilding(id); break;
      case 'place': if (this.scene) { this.scene.buildMode = { kind: target.dataset.kind as BuildingKind, rotated: false }; this.sim.notify('Boş bir yere dokunarak inşa et. R veya döndür düğmesiyle yönünü değiştir.'); } break;
      case 'rotate': if (this.scene?.buildMode) this.scene.buildMode.rotated = !this.scene.buildMode.rotated; break;
      case 'cancel-build': if (this.scene) this.scene.buildMode = undefined; break;
      case 'pause': this.sim.state.settings.paused = !this.sim.state.settings.paused; break;
      case 'speed': this.sim.state.settings.speed = this.sim.state.settings.speed === 1 ? 2 : 1; break;
      case 'boost':
        if (this.boostBusy || this.sim.state.boost.remaining > 0) break;
        this.boostBusy = true;
        try { const boost = await this.reward.requestReward(); if (boost) { this.sim.state.boost = boost; this.sim.notify('Paten boost hazır! 2 dakika boyunca %50 daha hızlı çalışıyorsunuz.'); } } catch { this.sim.notify('Ödül alınamadı. Tekrar deneyebilirsin.'); } finally { this.boostBusy = false; }
        break;
      case 'zoom-in': if (this.scene) this.scene.setZoom(this.scene.cameras.main.zoom * 1.15); break;
      case 'zoom-out': if (this.scene) this.scene.setZoom(this.scene.cameras.main.zoom / 1.15); break;
      case 'center': this.scene?.centerPlayer(); break;
      case 'fit': this.scene?.fit(true); break;
      case 'manual-save': this.sim.notify(this.sim.testMode ? 'Test modu normal kaydını değiştirmez; test ilerlemesi saklanmaz.' : this.save.save(this.sim.state) ? 'Mahallen kaydedildi.' : 'Kayıt yapılamadı. Tarayıcının depolama iznini kontrol et.'); break;
      case 'interact': this.interact(); break;
      case 'reset': document.querySelector<HTMLDialogElement>('#reset-dialog')!.showModal(); break;
      case 'cancel-reset': document.querySelector<HTMLDialogElement>('#reset-dialog')!.close(); break;
      case 'confirm-reset': if (!this.sim.testMode) { this.sim.state = initialState(); this.save.save(this.sim.state); } window.location.reload(); break;
    }
    this.render();
  }
  private setupJoystick() {
    const pad = document.querySelector<HTMLElement>('#joystick')!, knob = document.querySelector<HTMLElement>('#joystick-knob')!;
    const move = (e: PointerEvent) => { if (!pad.hasPointerCapture(e.pointerId)) return; const rect = pad.getBoundingClientRect(); let x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2; const d = Math.hypot(x, y); if (d > 28) { x *= 28 / d; y *= 28 / d; } knob.style.transform = `translate(${x}px, ${y}px)`; if (this.scene) this.scene.touchMovement = { x: x / 28, y: y / 28 }; };
    pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); move(e); });
    pad.addEventListener('pointermove', move);
    const stop = () => { knob.style.transform = ''; if (this.scene) this.scene.touchMovement = { x: 0, y: 0 }; };
    pad.addEventListener('pointerup', stop); pad.addEventListener('pointercancel', stop); pad.addEventListener('lostpointercapture', stop);
  }
  private overview() {
    const s = this.sim.state;
    const tasks = [
      ['Atığı yeniden düşün', 'Geri dönüşüm merkezinde atıkları ayrıştır.', (s.stats.produced.organic ?? 0) > 0],
      ['Toprağa hayat ver', 'Organik atıktan kompost üret.', (s.stats.produced.compost ?? 0) > 0],
      ['İlk sofrayı kur', 'Sebzelerden 2 yemek hazırla.', (s.stats.produced.meal ?? 0) >= 2],
      ['Komşularınla paylaş', 'Kooperatifte ilk sözleşmeyi teslim et.', s.completedContracts > 0]
    ];
    return `<span class="eyebrow">MAHALLE GÜNLÜĞÜ</span><h2>Döngü burada<br> başlar<span class="green">.</span></h2><p class="intro">Atıkların bir sonu değil, yeni bir başlangıcı var. Mahallene ikinci bir hayat ver.</p>
      <div class="chapter-progress"><span>${s.milestones ? 'İlk bölüm tamamlandı' : 'Yeni bir başlangıç'}</span><b>${tasks.filter(t => t[2]).length}/4</b><div class="progress-track"><i style="width:${tasks.filter(t => t[2]).length * 25}%"></i></div></div>
      <div class="task-list">${tasks.map(([name, desc, done], i) => `<div class="task ${done ? 'done' : ''}"><span class="task-number">${done ? icon('check') : `0${i + 1}`}</span><div><b>${name}</b><p>${desc}</p></div></div>`).join('')}</div>
      <div class="section-heading"><h3>Üretim döngüleri</h3><span>3 ZİNCİR</span></div>
      <div class="chain-card food"><span class="chain-symbol">🌱</span><div><b>Topraktan sofraya</b><small>Organik → kompost → sebze → yemek</small></div></div>
      <div class="chain-card furniture"><span class="chain-symbol">🪑</span><div><b>İkinci bir hayat</b><small>Lif + metal → mobilya</small></div></div>
      <div class="chain-card energy"><span class="chain-symbol">⚡</span><div><b>Mahallenin enerjisi</b><small>Organik → biyogaz → elektrik</small></div></div>
      ${this.contractCard()}
      ${this.boostCard()}`;
  }
  private contractCard() {
    const c = this.sim.contract;
    const stock = { ...this.sim.state.inventory }; for (const r of RESOURCE_IDS) stock[r] = (stock[r] ?? 0) + (this.sim.state.player.bag[r] ?? 0);
    return `<div class="contract-card"><div class="card-heading"><span class="eyebrow">ŞEHİR SÖZLEŞMESİ</span><span class="timer">${time(this.sim.state.contract.remaining)}</span></div><h3>${c.name}</h3><p>${c.description}</p><div class="tokens">${items(c.inputs)}</div><div class="contract-bottom"><span class="reward">+${this.sim.contractReward} <small>yaprak</small></span><button class="text-button" data-action="contract-goto">${has(stock, c.inputs) ? 'Teslimata git' : 'Kooperatife git'} ${icon('arrow')}</button></div></div>`;
  }
  private boostCard() {
    const boost = this.sim.state.boost;
    return `<div class="boost-card"><span class="boost-icon">🛼</span><div><b>Paten boost</b><p>${boost.remaining > 0 ? `%50 hız · ${time(boost.remaining)} kaldı` : '2 dakika boyunca %50 hız'}</p></div><button data-action="boost" class="boost-button" ${boost.remaining > 0 || this.boostBusy ? 'disabled' : ''}>${boost.remaining > 0 ? 'Aktif' : 'Dene'}</button><small class="boost-note">Ödüllü reklam denemesi · gerçek reklam içermez</small></div>`;
  }
  private buildingPanel() {
    const b = this.selected ? this.sim.building(this.selected) : undefined; if (!b) return this.overview();
    const def = BUILDINGS[b.kind], recipe = def.recipe, nearby = this.sim.nearby(b);
    const worker = this.sim.state.workers.find(w => w.assignedBuilding === b.id);
    let content = `<div class="panel-heading"><span class="eyebrow">${def.chain.toLocaleUpperCase('tr-TR')} · SEVİYE ${b.level}</span><button class="icon-button" data-action="close-panel" aria-label="Kapat">${icon('close')}</button></div><div class="building-portrait" style="--building-color:#${def.color.toString(16).padStart(6, '0')}"><span>${def.icon}</span><i>${def.chain}</i></div><h2>${def.name}</h2><p class="intro">${def.description}</p><div class="location-pill"><span class="live-dot ${nearby ? '' : 'muted'}"></span>${nearby ? 'Karakterin burada' : 'Karakterin binadan uzakta'}<button class="text-button" data-action="goto">Git ${icon('arrow')}</button></div>`;
    if (recipe && b.kind !== 'collection') content += `<div class="recipe-card"><span class="eyebrow">ÜRETİM TARİFİ</span><div class="tokens">${items(recipe.inputs)}</div><span class="recipe-arrow">↓ <small>${recipe.duration} saniye</small></span><div class="tokens">${items(recipe.outputs)}</div></div>`;
    if (b.job) content += `<div class="work-progress"><div><b>${b.job.owner === 'player' ? 'Senin görevin' : 'Çalışan üretimde'}</b><span>${Math.ceil(b.job.remaining)} sn</span></div><div class="progress-track"><i style="width:${(1 - b.job.remaining / b.job.total) * 100}%"></i></div></div>`;
    if (recipe) content += `<div class="section-heading"><h3>Hazır ürünler</h3><span>${count(b.output)}/${limit(this.sim.outputCapacity)}</span></div><div class="tokens output-tokens">${items(b.output) || '<span class="empty-note">Henüz hazır ürün yok.</span>'}</div><div class="button-row">${b.kind !== 'collection' ? `<button class="button primary" data-action="work" ${b.job && b.job.owner !== 'player' ? 'disabled' : ''}>${icon('bolt')}${b.job?.owner === 'player' ? 'Devam et' : 'Çalış'}</button>` : ''}<button class="button ${b.kind === 'collection' ? 'primary' : 'secondary'}" data-action="collect">${icon('bag')} Topla</button></div><button class="wide-text" data-action="depot">Çantayı depoya taşı ${icon('arrow')}</button><div class="worker-hint">${icon('team')}<span>${worker ? `${worker.name} · Seviye ${worker.level}` : 'Henüz çalışan atanmadı'}</span><button class="text-button" data-action="panel" data-panel="workers">Ekip</button></div>`;
    if (b.kind === 'warehouse') content += `<div class="capacity-card"><span>Depo kapasitesi</span><strong>${count(this.sim.state.inventory)} <small>/ ${limit(this.sim.capacity)}</small></strong><div class="progress-track"><i style="width:${Math.min(100, count(this.sim.state.inventory) / this.sim.capacity * 100)}%"></i></div></div><button class="button primary full" data-action="deposit">${icon('box')} Çantayı boşalt</button><div class="section-heading"><h3>Depodan al</h3><span>3 ADET</span></div><div class="warehouse-grid">${RESOURCE_IDS.map(r => `<button data-action="take" data-resource="${r}" ${!this.sim.state.inventory[r] ? 'disabled' : ''}><span>${RESOURCES[r].icon}</span><b>${RESOURCES[r].name}</b><small>${this.sim.state.inventory[r] ?? 0}</small></button>`).join('')}</div>`;
    if (b.kind === 'shop') content += `${this.contractCard()}<button class="button primary full" data-action="contract">${icon('check')} Siparişi teslim et</button>`;
    if (b.kind === 'home') content += `<div class="recipe-card"><span class="eyebrow">KOMŞULARIN İHTİYAÇLARI</span><div class="tokens">${items({ meal: 1, furniture: 1, electricity: 1 })}</div><p>Her teslimatta komşuların mutluluğu artar ve bütçene katkı gelir.</p></div><button class="button primary full" data-action="serve">${icon('bag')} Komşularına teslim et</button>`;
    if (b.level < 3) content += `<div class="upgrade-card"><div><b>Bir adım daha ileri</b><p>${b.kind === 'warehouse' ? '+100 depo kapasitesi' : b.kind === 'home' ? '+6 sakin, +%25 teslimat geliri' : b.kind === 'shop' ? '+%20 sözleşme ödülü' : b.kind === 'collection' ? '+3 atık / döngü' : '+%25 üretim verimliliği'}</p></div><button class="button secondary" data-action="building-upgrade">↑ ${Math.round(def.cost * 0.65 * b.level)} 🍃</button></div>`;
    const next: Partial<Record<BuildingKind, BuildingKind>> = { collection: 'recycling', recycling: 'composter', composter: 'farm', farm: 'kitchen', kitchen: 'shop', workshop: 'home', biogas: 'generator', generator: 'home' };
    if (next[b.kind]) content += `<button class="wide-text" data-action="next-station" data-kind="${next[b.kind]}">Sonraki durak: ${BUILDINGS[next[b.kind]!].name} ${icon('arrow')}</button>`;
    return content;
  }
  private buildPanel() {
    const available = (Object.keys(BUILDINGS) as BuildingKind[]).filter(kind => { const room = roomForKind(kind); return !room || this.sim.roomOpen(room.id); });
    return `<span class="eyebrow">İŞLETMENİ BÜYÜT · SEVİYE ${this.sim.level}</span><h2>Yeni odalar<span class="green">.</span></h2><p class="intro">Önce bölümü aç, sonra içerideki ekipmanları çoğalt veya yükselt. Satın almak için koridordaki alanda 1,3 saniye bekle.</p><div class="room-list">${ROOMS.map(r => { const open = this.sim.roomOpen(r.id), ready = this.sim.roomUnlockable(r.id); return `<button class="build-card room-card ${open ? 'room-open' : ready ? 'room-ready' : 'room-locked'}" data-action="room-goto" data-room="${r.id}"><span class="build-icon">${open ? r.icon : ready ? '＋' : '🔒'}</span><span><b>${r.name}</b><small>${open ? 'Açık · içine gir ve çalış' : `Seviye ${r.level}${r.requires && !this.sim.roomOpen(r.requires) ? ' · önce ' + ROOMS.find(other => other.id === r.requires)!.name : ''}`}</small></span><strong>${open ? '✓' : r.cost}<small>${open ? '' : '🍃'}</small></strong></button>`; }).join('')}</div><div class="section-heading"><h3>Ek ekipman</h3><span>AÇIK ODALAR</span></div><p class="intro">Ekipmanı yalnızca kendi odasının boş iç alanına yerleştirebilirsin; koridor ve kapılar açık kalır.</p>${this.scene?.buildMode ? `<div class="build-instructions"><b>${BUILDINGS[this.scene.buildMode.kind].name} seçildi</b><p>İlgili odanın boş bir hücresine dokun.</p><div class="button-row"><button class="button secondary" data-action="rotate">${icon('rotate')} Döndür</button><button class="button secondary" data-action="cancel-build">Vazgeç</button></div></div>` : ''}<div class="build-list">${available.map(kind => { const def = BUILDINGS[kind]; return `<button class="build-card" data-action="place" data-kind="${kind}" ${this.sim.state.money < def.cost ? 'disabled' : ''}><span class="build-icon">${def.icon}</span><span><b>${def.name}</b><small>${roomForKind(kind)?.name ?? 'Lobi'} · ${def.width}×${def.height}</small></span><strong>${def.cost}<small>🍃</small></strong></button>`; }).join('')}</div>`;
  }
  private workersPanel() {
    const workers = this.sim.state.workers;
    return `<span class="eyebrow">BİRLİKTE BÜYÜYELİM</span><h2>Mahallenin ekibi<span class="green">.</span></h2><p class="intro">Sen yol göster, onlar döngüyü sürdürsün. Her istasyona bir çalışan atanabilir.</p><div class="hire-card"><div><strong>${workers.length}<small> / ${this.sim.testMode ? '∞' : 5} çalışan</small></strong><p>Seviye 1 · %65 üretim hızı</p></div><button class="button primary" data-action="hire" ${!this.sim.testMode && workers.length >= 5 ? 'disabled' : ''}>${icon('plus')} ${100 + workers.length * 30} 🍃</button></div>${workers.length === 0 ? `<div class="empty-team">${icon('team')}<h3>İlk ekip arkadaşını bul.</h3><p>İşe al düğmesiyle bir çalışan ekle, sonra üretim binasını seç.</p></div>` : workers.map(w => `<div class="worker-card"><div class="worker-title"><span class="worker-avatar">${w.name[0]}</span><div><h3>${w.name}</h3><small>Seviye ${w.level} · %${65 + (w.level - 1) * 15} verim</small></div><span class="worker-status">${{ idle: 'Bekliyor', walking: 'Yolda', working: 'Üretiyor', hauling: 'Taşıyor' }[w.phase]}</span></div><label>Çalışma istasyonu<select aria-label="${w.name} çalışma istasyonu" data-worker="${w.id}"><option value="">Görev seç</option>${this.sim.state.buildings.filter(b => BUILDINGS[b.kind].workerSlots).map(b => `<option value="${b.id}" ${w.assignedBuilding === b.id ? 'selected' : ''} ${workers.some(other => other.id !== w.id && other.assignedBuilding === b.id) ? 'disabled' : ''}>${this.buildingLabel(b.id)}</option>`).join('')}</select></label>${count(w.carrying) ? `<div class="tokens">${items(w.carrying)}</div>` : ''}<button class="button secondary full" data-action="worker-upgrade" data-id="${w.id}" ${w.level >= 3 ? 'disabled' : ''}>${w.level >= 3 ? 'En yüksek seviye' : `Eğitim ver · ${w.level * 120} 🍃`}</button></div>`).join('')}<div class="small-callout">${icon('leaf')}<p>Çalışanlar ürünleri depoya otomatik taşır. Depo dolarsa ürünlerle beklerler.</p></div>`;
  }
  private campaignPanel() {
    return `<span class="eyebrow">BÜYÜK RESİM</span><h2>Bir şehrin hikâyesi<span class="green">.</span></h2><p class="intro">Küçük işletmeni oda oda büyüt. Her üretim 5 XP, her sipariş 20 XP kazandırır.</p><div class="campaign-list">${CHAPTERS.map((c, i) => `<div class="campaign-card ${c.available ? 'available' : 'locked'}"><span class="chapter-no">0${i + 1}</span><div><small>${c.available ? this.sim.state.milestones ? 'İLK SOFRA TAMAMLANDI' : 'ŞİMDİ OYNANIYOR' : 'GELECEK KAMPANYA BÖLÜMÜ'}</small><h3>${c.name}</h3><p>${c.description}</p></div></div>`).join('')}</div><div class="small-callout">${icon('flag')}<p>Oda açılışları kampanya bölümlerinden ayrıdır: sera seviye 2, mutfak 3, mobilya 4, enerji 5. Mahalle salonu mutfaktan sonra seviye 3'te açılır. Tam kampanya sonraki sürümlerde gelecek.</p></div>`;
  }
  private helpPanel() {
    return `<span class="eyebrow">BİRLİKTE ÖĞRENELİM</span><h2>İşletmene hoş geldin<span class="green">.</span></h2><p class="intro">Koridordan geri dönüşüm odasına gir. Ekipmana tıklayınca karakter çalışma noktasına yürür; kare alanda durmak işi otomatik başlatır ve tekrarlar.</p><div class="help-steps"><h3>Nasıl oynanır?</h3><p><b>1.</b> Atık topla, geri dönüşüm yap. Her üretim 5 XP; geri dönüşüm ayrıca 12 yaprak kazandırır.</p><p><b>2.</b> Alanda kaldıkça hazır ürünler otomatik çantana alınır. Çantanı lobideki depoda boşalt veya malzemeleri sonraki işte kullan.</p><p><b>3.</b> Lobide bankoya git, siparişi teslim et. Tamamlanan sipariş 20 XP verir.</p><p><b>4.</b> Seviye kazanınca kilitli odanın satın alma alanında 1,3 saniye bekle. Fiyata başlangıç ekipmanları dahildir.</p><p><b>5.</b> Sarı yükseltme noktasında bekle veya ekipmanın yanında Yükselt düğmesine bas. Model ve oda dekoru da gelişir.</p><p><b>6.</b> Açık odalara ek ekipman kur, çalışan işe al ve görevlendir. Duvarlar, kapılar ve koridor korunur.</p></div><div class="controls-guide"><h3>Kontroller</h3><p><kbd>W A S D</kbd> / oklar: hareket · kare alan: otomatik çalış</p><p><kbd>Boşluk</kbd>: duraklat / devam et</p><p><kbd>R</kbd>: ekipmanı döndür · <kbd>Esc</kbd>: iptal et</p><p>Haritayı sürükle · Tekerlekle / iki parmakla yakınlaştır</p><p>Mobilde: hareket çubuğu; kare alanda otomatik çalışma.</p></div><div class="small-callout">${icon('save')}<p>Her 15 saniyede otomatik kayıt. Son kayıt: ${this.save.lastSaved || 'henüz yapılmadı'}. Eski avlu kayıtları, satın alınmış içerikler korunarak odalara taşınır; yeni oyun küçük başlar.</p></div><button class="button secondary full" data-action="manual-save">${icon('save')} Şimdi kaydet</button><button class="wide-text danger-text" data-action="reset">Yeni oyuna başla</button>`;
  }
  private bagPanel() {
    return `<span class="eyebrow">YANINDAKİLER</span><h2>Bir çanta dolusu fırsat<span class="green">.</span></h2><p class="intro">Çantan üretim girdilerini ve teslimat ürünlerini taşır. Depoya giderek boşaltabilirsin.</p><div class="capacity-card"><span>Çanta kapasitesi</span><strong>${count(this.sim.state.player.bag)}<small> / ${limit(this.sim.bagCapacity)}</small></strong><div class="progress-track"><i style="width:${count(this.sim.state.player.bag) / this.sim.bagCapacity * 100}%"></i></div></div><div class="bag-items">${RESOURCE_IDS.filter(r => this.sim.state.player.bag[r]).map(r => `<div><span>${RESOURCES[r].icon}</span><b>${RESOURCES[r].name}</b><strong>${this.sim.state.player.bag[r]}</strong></div>`).join('') || '<p class="empty-note">Çantan şu an boş. Hazır ürünleri toplayarak başlayabilirsin.</p>'}</div><button class="button primary full" data-action="depot">${icon('box')} Depoya git</button>`;
  }
  render() {
    const s = this.sim.state;
    const done = [(s.stats.produced.organic ?? 0) > 0, (s.stats.produced.compost ?? 0) > 0, (s.stats.produced.meal ?? 0) >= 2, s.completedContracts > 0].filter(Boolean).length;
    const room = roomAt(Math.round(s.player.x), Math.round(s.player.y));
    const base = LEVEL_XP[this.sim.level - 1], end = this.sim.nextLevelXp;
    document.querySelector('.map-label')!.innerHTML = `<span>⭐ SEVİYE ${this.sim.level} · ${s.xp}${end > base ? '/' + end : ' XP'}</span><h1>${room && this.sim.roomOpen(room.id) ? room.name : s.player.y >= 33 ? 'Lobi · Kooperatif' : 'Ana koridor'}</h1><div class="facility-xp"><i style="width:${end > base ? Math.min(100, (s.xp - base) / (end - base) * 100) : 100}%"></i></div><p>Kare alanda dur · Otomatik çalış · Yeni bölümler aç</p>`;
    document.querySelector('.map-badge')!.innerHTML = this.sim.testMode ? '∞ MALZEME · ∞ KAPASİTE · SINIRSIZ BONUS' : s.boost.remaining > 0 ? `⚡ %50 hız · ${time(s.boost.remaining)}` : '3D TYCOON · YENİHAYAT';
    const nearby = s.buildings.find(b => this.sim.nearby(b));
    const actionsHtml = nearby ? `<button data-action="inspect" data-id="${nearby.id}" aria-label="Yakındaki ekipman detayları">${icon('help')} Detay</button>${nearby.level < 3 ? `<button data-action="building-upgrade" data-id="${nearby.id}" aria-label="Yakındaki ekipmanı yükselt">↑ ${Math.round(BUILDINGS[nearby.kind].cost * .65 * nearby.level)} 🍃</button>` : '<span>Sv. 3 · Tam gelişmiş</span>'}` : '';
    const actionsHost = document.querySelector('#station-actions')!; if (actionsHost.innerHTML !== actionsHtml) actionsHost.innerHTML = actionsHtml;
    document.querySelector('.auto-work-status')!.textContent = this.sim.workAreaStatus;
    document.querySelector('#top-stats')!.innerHTML = `<div class="stat residents">${icon('team')}<span>${s.buildings.filter(b => b.kind === 'home').reduce((n, b) => n + b.level * 6, 0)}<small>sakin</small></span></div><div class="stat happiness"><span class="sun-icon">☀</span><span>%${this.sim.happiness}<small>mutluluk</small></span></div><div class="money-stat">${icon('leaf')}<span>${this.sim.testMode ? '∞' : Math.floor(s.money).toLocaleString('tr-TR')}<small>yaprak</small></span></div>`;
    document.querySelector('#stock-count')!.textContent = `${count(s.inventory)}/${limit(this.sim.capacity)}`;
    document.querySelector('#bag-count')!.textContent = `${count(s.player.bag)}/${limit(this.sim.bagCapacity)}`;
    document.querySelector('.bag-button')!.setAttribute('aria-label', `Çanta: ${count(s.player.bag)}/${limit(this.sim.bagCapacity)}`);
    document.querySelector('#stock-strip')!.innerHTML = RESOURCE_IDS.map(r => `<div class="stock-item" title="${RESOURCES[r].name}" style="--resource:${RESOURCES[r].color}"><span>${RESOURCES[r].icon}</span><b>${this.sim.testMode ? '∞' : s.inventory[r] ?? 0}</b><small>${RESOURCES[r].name}</small></div>`).join('');
    document.querySelector('#time-controls')!.innerHTML = `<span class="day-label">Gün ${Math.floor(s.elapsed / 240) + 1}<small>${time(s.elapsed)}</small></span><button data-action="pause" aria-label="${s.settings.paused ? 'Devam et' : 'Duraklat'}" class="${s.settings.paused ? 'is-paused' : ''}">${icon(s.settings.paused ? 'play' : 'pause')}</button><button data-action="speed" aria-label="Oyun hızı" class="speed-button">${s.settings.speed}×</button>`;
    const html = this.panel === 'building' ? this.buildingPanel() : this.panel === 'build' ? this.buildPanel() : this.panel === 'workers' ? this.workersPanel() : this.panel === 'campaign' ? this.campaignPanel() : this.panel === 'help' ? this.helpPanel() : this.panel === 'bag' ? this.bagPanel() : this.overview();
    if (html !== this.lastPanelHTML && document.activeElement?.tagName !== 'SELECT') { const body = document.querySelector('#panel-body')!; body.innerHTML = html; this.lastPanelHTML = html; }
    document.querySelectorAll<HTMLElement>('.nav-button[data-panel]').forEach(button => button.classList.toggle('active', button.dataset.panel === this.panel || (this.panel === 'building' && button.dataset.panel === 'overview')));
    const mode = this.scene?.buildMode;
    document.querySelector('#placement-hint')!.innerHTML = mode ? `<div class="placement-hint">${icon('build')} ${BUILDINGS[mode.kind].name}<button data-action="rotate" aria-label="Döndür">${icon('rotate')}</button><button data-action="cancel-build" aria-label="İptal">${icon('close')}</button></div>` : '';
    if (this.lastMessageId !== this.sim.messageId) {
      this.lastMessageId = this.sim.messageId; const toast = document.querySelector<HTMLElement>('#toast')!;
      toast.innerHTML = `${icon('leaf')}<span>${this.sim.message}</span>`; toast.classList.add('visible');
      window.clearTimeout(Number(toast.dataset.timer)); toast.dataset.timer = String(window.setTimeout(() => toast.classList.remove('visible'), 6500));
    }
  }
}
