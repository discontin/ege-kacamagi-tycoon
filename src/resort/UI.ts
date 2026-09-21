import { initialResort, LEVELS, POOL_UNLOCK_LEVEL, ROOM_DEFS, upgradeCost } from './data';
import { atOffice } from './Office';
import './office-window.css';
import './game-menus.css';
import './quick-controls.css';
import { resortGoal } from './Guidance';
import { linenCount } from './Linen';
import { ResortSaveService } from './SaveService';
import { ResortSimulation } from './Simulation';
import type { Role } from './types';
import type { ResortWorld } from './World';

const roles: Record<Role, string> = { reception: 'Resepsiyon', rooms: 'Oda temizliği + havlu', pool: 'Havuz + limonata + bakım', hauling: 'Çamaşırhane + havuz havluları', bartender: 'Havuz hizmeti' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export class ResortUI {
  world?: ResortWorld;
  private panel = 'village';
  private lastPanel = '';
  private lastMessage = -1;
  private interval: number;
  private html(selector: string, value: string) { const el = document.querySelector(selector)!; if (el.innerHTML !== value) el.innerHTML = value; }
  constructor(private sim: ResortSimulation, private save: ResortSaveService) {
    document.querySelector('#app')!.innerHTML = `
      <main id="game" aria-label="Tatil köyü haritası"></main>
      <header class="resort-brand"><span class="brand-mark">☀</span><div>Ege<span>Kaçamağı.</span><small>TATİL KÖYÜ TYCOON</small></div></header>
      <div id="level-card" class="level-card"></div><div id="wallet" class="wallet"></div>
      <div class="mode-controls">${sim.testMode ? '<span>∞ TEST MODU · KAYIT YOK</span><button data-action="test">Normal oyuna dön</button>' : '<button data-action="test">∞ Sınırsız test modu</button>'}</div>
      <div class="quick-controls" aria-label="Oyun kontrolleri"><button id="speed-button" data-action="speed" aria-label="2 kat hız" aria-pressed="false">2× Hız</button><button data-action="reset" aria-label="Oyunu sıfırla">↻ Sıfırla</button></div>
      <div class="camera-controls"><button data-action="zoom-in" aria-label="Yakınlaştır">＋</button><button data-action="zoom-out" aria-label="Uzaklaştır">−</button><button data-action="focus" aria-label="Karaktere odaklan">◎</button><button data-action="map" aria-label="Tüm haritayı göster">▦</button></div>
      <div class="resort-toast" id="toast" role="status"></div>
      <div id="joystick" aria-label="Hareket çubuğu"><div id="joystick-knob"></div></div>
      <nav hidden aria-label="Yönetim panelleri"><button data-action="panel" data-panel="village">⌂<small>Köy</small></button><button data-action="panel" data-panel="workers">♙<small>Ekip</small></button><button data-action="panel" data-panel="journey">☆<small>Hedefler</small></button><button data-action="panel" data-panel="help">?<small>Rehber</small></button></nav>
      <div hidden><div id="bag-stat"></div><div id="laundry-stat"></div><div id="time-controls"></div></div>
      <aside id="drawer" class="resort-drawer"><button data-action="close" class="drawer-close" aria-label="Paneli kapat">×</button><div id="drawer-body"></div></aside>
      <dialog id="pause-dialog" class="game-menu">
        <div class="game-menu-frame">
          <header class="game-menu-ribbon"><span>☀ EGE KAÇAMAĞI</span><span class="menu-status">MOLA ZAMANI</span></header>
          <div class="game-menu-content">
            <div class="pause-heading"><span class="pause-emblem">Ⅱ</span><div><small>KÜÇÜK BİR NEFES</small><h2>Mola ver, kaptan!</h2><p>Köyün seni bekliyor. Hazır olduğunda kaldığın yerden sürdür.</p></div></div>
            <section class="sound-card" aria-label="Ses ayarı"><div class="menu-section-heading"><span>♫</span><b>ORTAM SESİ</b><output id="volume-value">%100</output></div><label class="volume-row"><span aria-hidden="true">🔈</span><input id="sound-volume" aria-label="Ses seviyesi" type="range" min="0" max="100" step="1"></label></section>
            <section class="music-card" aria-label="Müzik çalar, yakında eklenecek">
              <span class="music-cover" aria-hidden="true">♫</span>
              <div class="music-player">
                <div class="music-title-row"><div><b>Fon müziği</b><small>İlerleyen aşamada eklenecek</small></div><span>YAKINDA</span></div>
                <div class="music-timeline" aria-hidden="true"><i></i></div>
                <div class="music-controls"><small>--:--</small><div><button disabled aria-label="Önceki parça">◀</button><button class="music-play" disabled aria-label="Müzik yakında eklenecek">▶</button><button disabled aria-label="Sonraki parça">▶▶</button></div><small>--:--</small></div>
              </div>
            </section>
            <div class="menu-actions"><button data-action="resume" class="menu-continue"><span>Oyuna dön</span><kbd>ESC ↵</kbd></button><button data-action="reset" class="menu-newgame">Yeni köy kur</button></div>
          </div>
          <footer class="game-menu-footer"><span>☼</span> Her şey yolunda, tatil devam ediyor.</footer>
        </div>
      </dialog>
      <dialog id="restart-dialog" class="game-menu restart-menu">
        <div class="game-menu-frame">
          <header class="game-menu-ribbon"><span>☀ EGE KAÇAMAĞI</span><span class="menu-status">YENİ SAYFA</span></header>
          <div class="game-menu-content restart-content"><span class="restart-emblem">↻</span><small>KÖYÜ YENİDEN KUR</small><h2>Yeni bir başlangıç?</h2><p>${sim.testMode ? 'Test köyü baştan başlar. Normal oyun kaydın değişmez.' : 'Mevcut ilerlemen sıfırlanır. Bu karar geri alınamaz.'}</p><div class="menu-actions"><button data-action="cancel-reset" class="menu-continue">Biraz daha kal</button><button data-action="confirm-reset" class="menu-newgame">Sıfırla</button></div></div>
        </div>
      </dialog>`;
    document.querySelector('#app')!.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (t) this.action(t); });

    this.interval = window.setInterval(() => this.render(), 150); this.render();
    const pause = document.querySelector<HTMLDialogElement>('#pause-dialog')!;
    pause.addEventListener('cancel', e => { e.preventDefault(); this.sim.state.settings.paused = false; pause.close(); });
    window.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.repeat || document.querySelector('#restart-dialog[open]')) return;
      e.preventDefault(); this.sim.state.settings.paused = !this.sim.state.settings.paused; this.render();
    });
    document.querySelector<HTMLInputElement>('#sound-volume')!.addEventListener('input', e => {
      this.sim.state.settings.volume = Number((e.target as HTMLInputElement).value) / 100; this.render();
    });
  }
  inspect(id: string) { this.panel = 'village'; this.lastPanel = ''; this.render(); document.querySelector('#drawer')!.classList.add('open'); const row = document.querySelector(`[data-facility="${id}"]`); row?.scrollIntoView({ block: 'nearest' }); }
  private action(t: HTMLElement) {
    switch (t.dataset.action) {
      case 'resume': this.sim.state.settings.paused = false; break;
      case 'staff-speed': this.sim.upgradeWorker(t.dataset.worker!); break;
      case 'staff-move': this.sim.upgradeMove(t.dataset.worker!); break;
      case 'staff-carry': this.sim.upgradeCarry(t.dataset.worker!); break;
      case 'laundry-upgrade': this.sim.upgradeLaundry(); break;
      case 'laundry-buy-towels': this.sim.buyLaundryTowels(); break;
      case 'panel': this.panel = t.dataset.panel!; this.lastPanel = ''; document.querySelector('#drawer')!.classList.add('open'); break;
      case 'close': document.querySelector('#drawer')!.classList.remove('open'); break;
      case 'goto': this.sim.goToArea(t.dataset.area!); this.world?.centerPlayer(); document.querySelector('#drawer')!.classList.remove('open'); break;


      case 'cancel-job': if (this.sim.state.player.task) this.sim.cancelTask(this.sim.state.player.task); break;
      case 'pause': this.sim.state.settings.paused = !this.sim.state.settings.paused; break;
      case 'speed': this.sim.state.settings.speed = this.sim.state.settings.speed === 1 ? 2 : 1; break;
      case 'boost': this.sim.activateBoost(); break;
      case 'zoom-in': this.world?.setZoom(1.1); break;
      case 'zoom-out': this.world?.setZoom(.9); break;
      case 'focus': this.world?.centerPlayer(); break;
      case 'map': this.world?.showAll(); break;
      case 'test': { const url = new URL(location.href); if (this.sim.testMode) url.searchParams.delete('test'); else url.searchParams.set('test', '1'); location.href = url.href; break; }
      case 'save': this.sim.notify(this.save.save(this.sim.state) ? this.sim.testMode ? 'Test modu normal kaydını değiştirmez.' : 'Tatil köyün kaydedildi.' : 'Kayıt yapılamadı. Tarayıcı depolamasını kontrol et.'); break;
      case 'reset': document.querySelector<HTMLDialogElement>('#restart-dialog')!.showModal(); break;
      case 'cancel-reset': document.querySelector<HTMLDialogElement>('#restart-dialog')!.close(); break;
      case 'confirm-reset': { const fresh = new ResortSimulation(initialResort(this.sim.testMode), this.sim.testMode).state; fresh.settings.volume = this.sim.state.settings.volume; if (this.sim.testMode || this.save.save(fresh)) { this.sim.reset(); document.querySelector<HTMLDialogElement>('#restart-dialog')!.close(); document.querySelector<HTMLDialogElement>('#pause-dialog')!.close(); document.querySelector('#drawer')!.classList.remove('open'); this.officeVisited = false; this.world?.centerPlayer(); } else this.sim.notify('Kayıt yapılamadı; mevcut köyün korunuyor.'); break; }
    }
    this.render();
  }
  private goal() { return resortGoal(this.sim.state, this.sim.testMode); }
  private village() {
    const s = this.sim.state;
    return `<span class="eyebrow">KÜÇÜK BİR EGE HİKÂYESİ</span><h2>Senin tatil köyün<span>.</span></h2><p class="intro">Misafirlerin rahat etsin, sen köyünü büyüt. İşleri beyaz karelerde durarak yap.</p><div class="panel-metrics"><b>${s.stats.stays}<small>Konaklama</small></b><b>${s.stats.poolVisits}<small>Havuz ziyareti</small></b><b>${s.stats.earned}<small>Toplanan para</small></b></div>${s.facilities.map(f => {
      const r = ROOM_DEFS.find(r => r.id === f.id), name = r?.name ?? (f.id === 'reception' ? 'Resepsiyon' : f.id === 'laundry' ? 'Çamaşırhane' : 'Havuz');
      const a = this.sim.areas.find(a => a.target === f.id && a.mode === (f.open ? 'work' : 'buy'));
      const description = !f.open ? `Seviye ${a ? this.sim.requiredLevel(a) : 1} · ${a ? this.sim.cost(a) : 0} para` : f.kind === 'room' ? f.guest ? 'Misafir ağırlanıyor' : f.dirty ? 'Yatağı toparla' : f.floorDirty ? 'Zemini süpür' : f.bathroomDirty ? 'Banyoyu temizle' : f.needsSheet ? 'Temiz çarşaf ve havlu getir' : f.towels ? 'Misafire hazır' : 'Temiz havlu gerekiyor' : f.kind === 'laundry' ? 'Kirliyi bırak → yıka → temizini taşı' : f.cash ? `${f.cash} para kasada` : 'Hizmete hazır';
      return `<article class="facility-row" data-facility="${f.id}"><span class="row-icon">${f.kind === 'room' ? '⌂' : f.kind === 'pool' ? '≈' : f.kind === 'laundry' ? '▣' : '☀'}</span><div><b>${name}</b><small>${description}${f.open ? ' · Sv. ' + f.level : ''}</small></div>${a ? `<button data-action="goto" data-area="${a.id}">${f.open ? 'Git' : 'Alanı bul'}</button>` : ''}</article>`;
    }).join('')}${this.sim.facility('pool').open ? `<article class="facility-row"><span class="row-icon">🍋</span><div><b>Havuz barı</b><small>${s.bar?.open ? 'Limonata servisi · ' + s.bar.cash + ' ₺ kasada' : '200 ₺ karşılığında aç'}</small></div><button data-action="goto" data-area="${s.bar?.open ? 'barPrepare' : 'barBuy'}">Git</button></article>` : ''}<div class="bonus-card"><b>☀ Biraz hız kazanalım</b><p>120 saniye çalışma ve üretim %50 hızlı. Gerçek reklam değil, test bonusu.</p><button data-action="boost" ${s.boost.remaining > 0 ? 'disabled' : ''}>${s.boost.remaining > 0 ? Math.ceil(s.boost.remaining) + ' sn kaldı' : 'Bonusu etkinleştir'}</button></div><div class="coming-soon"><b>İleride köye katılacaklar</b><p>Restoran · Spa · Plaj hizmetleri · Otopark</p><small>Bu sürümde kapalı; henüz satın alınamaz.</small></div>`;
  }
  private workers() {
    const s = this.sim.state;
    return `<span class="eyebrow">EKİBİN</span><h2>Herkes kendi işinde<span>.</span></h2><p class="intro">İlgili bölümün yanındaki yeşil personel simgesinde durarak işe al. Çalışan kendi bölümünde otomatik çalışır.</p>${s.workers.map(w => `<article class="worker-card"><div class="worker-header"><b>♙ ${esc(w.name)}</b><small>${roles[w.role]}</small></div><p>${esc(w.status)}</p></article>`).join('')}${!s.workers.length ? '<p class="empty">Resepsiyon, odalar, çamaşırhane ve havuz yakınındaki personel simgelerini kullan.</p>' : ''}`;
  }
  private journey() {
    const s = this.sim.state, goals = [['İlk misafiri karşıla', s.stats.welcomed > 0], ['İlk konaklamayı tamamla', s.stats.stays > 0], ['İlk odayı temizle', s.stats.cleaned > 0], ['Kirli havluyu yıka', s.stats.washed > 0], ['İkinci bungalovu aç', this.sim.facility('room2').open], ['İlk çalışanı al', s.workers.length > 0], ['Havuzu aç', this.sim.facility('pool').open], ['İlk havuz hizmetini tamamla', s.stats.poolVisits > 0], ['Altı bungalovu aç', ROOM_DEFS.every(r => this.sim.facility(r.id).open)]];
    const levelReward = (i: number) => i === 0 ? 'Başlangıç' : i <= 5 ? `Bungalov ${i + 1}${i === 1 ? ' + çalışanlar' : ''}` : i + 1 === POOL_UNLOCK_LEVEL ? 'Havuz erişimi' : 'Oyuncu hız ve iş verimi';
    return `<span class="eyebrow">BÜYÜK BİR KAÇAMAĞA DOĞRU</span><h2>Küçük adımlar<span>.</span></h2><p class="intro">Müşteri kabulü +10, oda temizliği +5, havuz hizmeti +5 XP.</p>${goals.map(([title, done]) => `<div class="goal-row ${done ? 'done' : ''}"><span>${done ? '✓' : '○'}</span>${title}</div>`).join('')}<h3>Seviye açılışları</h3>${LEVELS.map((xp, i) => `<p class="unlock-line">⭐ ${i + 1}. seviye · ${xp} XP · ${levelReward(i)}</p>`).join('')}`;
  }
  private help() {
    return `<span class="eyebrow">NASIL OYNANIR?</span><h2>Acele yok, tatildesin<span>.</span></h2><ol class="help-list"><li>Beyaz resepsiyon karesinde dur. Misafir varsa hazır bir odaya yerleşir.</li><li>Misafir karşılanınca para toplama noktasında ücret birikir. Yanına yürüyerek topla.</li><li>Yatak simgesine yürü: yatağın herhangi bir kenarında durarak çarşafları topla. Kirli havlu ve çarşaf çantana alınır; ikisi de sepete taşınıp makinede yıkanır. Temiz çarşafı raftan alıp yatağa geri getir. Süpürge simgesinin alanında zemini ayrıca temizle.</li><li>Kirli havlu sepetine yaklaş; havlular otomatik bırakılır. Makine kendisi yıkar.</li><li>Temiz havlu rafına yaklaşarak havlu al; odanın karesinde durarak bırak. Bir oda için gereken temiz çarşaf alınır; toplam çanta kapasitesi sekiz parçadır.</li><li>Makine kapasitesini yükseltmek veya temiz havlu satın almak için işletme ofisini kullan.</li><li>Yeşil alan yeni tesis açar, sarı alan mevcut tesisi yükseltir. 1,3 saniye bekle; yeniden satın almak için ayrılıp dön.</li><li>Havuzu açınca konaklayan misafirler yer varsa havuza gider. Girişte karşıla, rafta havlu bulundur ve şezlongları temizle.</li></ol><p>Havuz barını 200 ₺’ye aç. Bardak simgesindeki misafire limonata hazırlayıp tepsiyle götür; teslim başına 15 ₺ bar kasasına gelir. Dört havuz ziyareti sonrası yeni girişler bakım için durur; kepçe simgesine veya havuzun kenarına yaklaşarak temizle. Bar yanında barmen alabilirsin.</p><h3>Kontroller</h3><p>WASD / oklar veya mobil hareket çubuğu. Yere ve kare etiketine dokunarak yürü. Etkileşim tuşu yok.</p><p>Boşluk: duraklat. Tekerlek / iki parmak: yakınlaştır. Sürükle: kamerayı gezdir. ◎: karaktere dön.</p><p>Bir işi yarıda bırakınca aynı kareye dönerek devam edebilirsin. Rehberdeki görevi bırak düğmesi görev rezervasyonunu serbest bırakır.</p>${this.sim.state.player.task ? '<button data-action="cancel-job">Geçerli görevi bırak</button>' : ''}<button class="primary" data-action="save">Şimdi kaydet</button><p class="muted">15 saniyede otomatik kayıt · ${this.save.lastSaved || 'Henüz kayıt yok'}. Çevrimdışı gelir yok. Eski oyun kaydı korunur.</p><button class="danger" data-action="reset">Yeni tatil köyü kur</button>`;
  }
  private officeVisited = false;
  private office() {
    const workers = this.sim.state.workers, laundry = this.sim.facility('laundry');
    const skill = (name: string, stat: string, action: string, id: string, level: number, cost: number, glyph: string) => `
      <div class="office-skill">
        <div class="office-skill-info"><span class="office-skill-icon">${glyph}</span><span><b>${name}</b><small>${stat}</small></span><strong>${level}/3</strong></div>
        <div class="office-meter" aria-label="Seviye ${level} / 3">${[1, 2, 3].map(step => `<i class="${step <= level ? 'lit' : ''}"></i>`).join('')}</div>
        <button data-action="${action}" data-worker="${id}" ${level >= 3 ? 'disabled' : ''}>${level >= 3 ? 'EN İYİ SEVİYE' : `Geliştir <span>${this.sim.testMode ? 'Ücretsiz' : cost + ' ₺'}</span>`}</button>
      </div>`;
      return `
        <header class="office-banner"><div><small>PERSONEL · EĞİTİM</small><h2>İşletme ofisi</h2><p>Ekibinin gelişimini buradan yönet.</p></div><span class="office-team-count"><b>${workers.length}</b><small>ÇALIŞAN</small></span></header>
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
        <div class="office-roster"><span>EKİP LİSTESİ</span><small>Gelişim hemen etkili olur</small></div>
      ${workers.map(w => `
        <article class="office-worker">
          <header class="office-worker-head"><span class="office-avatar">${esc(w.name[0].toUpperCase())}</span><span class="office-worker-name"><b>${esc(w.name)}</b><small>${roles[w.role]}</small></span><span class="office-rank">SV. ${w.level}</span></header>
          <div class="office-skills ${w.role === 'reception' ? 'single' : ''}">
            ${skill('Hizmet hızı', 'Görevleri daha hızlı tamamlar', 'staff-speed', w.id, w.level, 120 * w.level, '☀')}
            ${w.role !== 'reception' ? skill('Yürüyüş', 'Daha hızlı hareket', 'staff-move', w.id, w.moveLevel ?? 1, 100 * (w.moveLevel ?? 1), '➜') + skill('Taşıma', (w.carryLevel ?? 1) + ' havlu kapasitesi', 'staff-carry', w.id, w.carryLevel ?? 1, 100 * (w.carryLevel ?? 1), '▱') : ''}
          </div>
        </article>`).join('') || '<div class="office-empty"><span>♙</span><b>Ekip henüz kurulmadı</b><p>Önce köydeki yeşil personel simgelerinden bir çalışan al.</p></div>'}
      <footer class="office-footer"><span>✦</span> Her yükseltme iş başında hemen etkisini gösterir.</footer>`;
  }
  render() {
    const pause = document.querySelector<HTMLDialogElement>('#pause-dialog')!;
    if (this.sim.state.settings.paused && !pause.open && !document.querySelector('#restart-dialog[open]')) pause.showModal();
    if (!this.sim.state.settings.paused && pause.open) pause.close();
    const volume = this.sim.state.settings.volume ?? 1;
    this.world?.setVolume(volume);
    document.querySelector<HTMLInputElement>('#sound-volume')!.value = String(Math.round(volume * 100));
    document.querySelector('#volume-value')!.textContent = '%' + Math.round(volume * 100);
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
    this.html('#wallet', `<span>₺</span><b>${this.sim.testMode ? '∞' : Math.floor(s.money).toLocaleString('tr-TR')}<small>kasa</small></b>`);
    this.html('#level-card', `<div><span class="level-star">★ ${level}</span><small class="level-xp">${s.xp}${end ? '/' + end : ''} XP${s.boost.remaining ? ' · ☀ ' + Math.ceil(s.boost.remaining) + ' sn' : ''}</small></div><div class="xp-track"><i style="width:${end ? Math.min(100, (s.xp - base) / (end - base) * 100) : 100}%"></i></div>`);
    this.html('#bag-stat', `<span>☀ ${s.player.bag.clean} <small>temiz</small></span><span>♺ ${s.player.bag.dirty} <small>kirli</small></span><span>▱ ${s.player.bag.cleanSheets ?? 0}/${s.player.bag.dirtySheets ?? 0} <small>temiz/kirli çarşaf</small></span><small>${s.player.drink ? '<span>🍋 <small>limonata</small></span>' : ''}ÇANTA ${linenCount(s.player.bag)}/${this.sim.bagCapacity}</small>`);
    this.html('#laundry-stat', `<span>▣ ${this.sim.testMode ? '∞' : s.laundry.clean}<small>temiz raf</small></span><span>${s.laundry.dirty}<small>havlu yıkanacak</small></span><span>▱ ${s.laundry.cleanSheets ?? 0}/${s.laundry.dirtySheets ?? 0}<small>temiz/kirli çarşaf</small></span>`);
    this.html('#time-controls', `<button data-action="pause" aria-label="${s.settings.paused ? 'Devam et' : 'Duraklat'}">${s.settings.paused ? '▶' : 'Ⅱ'}</button><button data-action="speed" aria-label="Oyun hızı">${s.settings.speed}×</button>`);
    const html = this.panel === 'office' ? this.office() : this.panel === 'workers' ? this.workers() : this.panel === 'journey' ? this.journey() : this.panel === 'help' ? this.help() : this.village();
    if (html !== this.lastPanel && document.activeElement?.tagName !== 'SELECT') { document.querySelector('#drawer-body')!.innerHTML = html; this.lastPanel = html; }
    if (this.lastMessage !== this.sim.messageId) { const id = this.sim.messageId; this.lastMessage = id; const t = document.querySelector('#toast')!; t.textContent = this.sim.message; t.classList.add('show'); window.setTimeout(() => { if (id === this.sim.messageId) t.classList.remove('show'); }, 4500); }
  }
  dispose() { clearInterval(this.interval); }
}
