import { BAR_CASH, DRINK_REQUEST_DELAY, POOL_STAY_SECONDS, insideBar, wantsDrink } from './PoolServices';
import { guestTip } from './GuestMood';
import { atOffice, carryingCapacity, OFFICE, towelLimit, workerMoveSpeed } from './Office';
import { guestPreferences } from './GuestPreferences';
import { staffHireCost, staffRole } from './StaffHiring';
import { areasFor, CLEAN_TAKE, DIRTY_DROP, EXIT, HEIGHT, incomeFactor, initialResort, LEVELS, MAP_MAX_X, MAP_MIN_X, POOL_GATE, receptionQueuePoint, ROOM_DEFS, ROOM_DOOR, ROOM_WORK, SEAT_DEFS, taskDuration, upgradeCost, WIDTH } from './data';
import type { Actor, Area, GuestState, PlayerState, Point, ResortGameState, Role, TaskKind, TaskState, WorkerState } from './types';
import { serviceGuestReady } from './CustomerService';
import { workAreaContains } from './WorkAreas';
import { dirtyLinenCount, linenCount } from './Linen';
import { inFootprint, laundryObstacles } from './LaundryLayout';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const bagCount = (a: PlayerState | WorkerState) => linenCount(a.bag);
export class ResortSimulation {
  /** Transient presentation events; never persisted or replayed after loading. */
  feedback: { kind: 'cash' | 'clean' | 'towel' | 'build' | 'level' | 'welcome' | 'wash'; x: number; y: number; text: string }[] = [];
  private celebrate(kind: ResortSimulation['feedback'][number]['kind'], at: Point, text: string) { this.feedback.push({ kind, ...at, text }); if (this.feedback.length > 64) this.feedback.shift(); }
  message = 'Ege Kaçamağı’na hoş geldin! Beyaz resepsiyon karesinde dur ve ilk misafirini karşıla.';
  messageId = 0;
  status = 'Beyaz karede dur · otomatik çalış';
  private purchase = { id: '', hold: 0, latched: false };
  private blockedNotice = '';
  constructor(public state = initialResort(), readonly testMode = false) {
    // Rooms now end at level two. Preserve older saves by folding former level-three
    // suites back into the fully featured level-two room instead of rejecting them.
    for (const facility of state.facilities.filter(f => f.kind === 'room')) facility.level = Math.min(facility.level, 2);
    state.bar ??= { open: testMode, cash: 0 };
    if (testMode) state.bar.open = true;
    state.laundry.cleanSheets ??= testMode ? 999 : 8;
    while (state.seats.length < SEAT_DEFS.length) state.seats.push({ id: SEAT_DEFS[state.seats.length].id, open: state.facilities.find(f => f.id === 'pool')!.level * 2 > state.seats.length, dirty: false, towel: state.facilities.find(f => f.id === 'pool')!.level * 2 > state.seats.length });
    state.laundry.dirtySheets ??= 0;
    if (state.laundry.remaining !== null) { state.laundry.washingTowels ??= state.laundry.washingKind === 'sheet' ? 0 : 1; state.laundry.washingSheets ??= state.laundry.washingKind === 'sheet' ? 1 : 0; }
    for (const w of state.workers) w.moveLevel ??= w.role === 'reception' ? 1 : w.level;

    // Retain previously paid staff and carried stock when merging the bar department.
    for (const w of state.workers.filter(w => w.role === 'bartender')) {
      if (w.task) this.cancelTask(w.task);
      w.role = state.workers.some(other => other !== w && other.role === 'pool') ? 'hauling' : 'pool';
      w.path = [];
    }
    // Preserve saves while replacing routes that used the former front-facing entrances.
    for (const actor of [state.player, ...state.workers, ...state.guests]) {
      const destination = actor.path.at(-1);
      const displacedByBar = state.bar.open && insideBar({ x: Math.round(actor.x), y: Math.round(actor.y) });
      if (displacedByBar) { actor.x = BAR_CASH.x; actor.y = BAR_CASH.y; }
      const formerDoor = ROOM_DEFS.find(r => this.facility(r.id).open && Math.round(actor.x) === r.x + 5 && Math.round(actor.y) === r.y + 7);
      if (formerDoor) actor.y = formerDoor.y + 6;
      if (destination && (displacedByBar || formerDoor || actor.path.some(p => !this.isWalkable(p.x, p.y)))) {
        const oldEndpoint = ROOM_DEFS.find(r => this.facility(r.id).open && destination.x === r.x + 5 && destination.y === r.y + 7);
        actor.path = this.path(actor, oldEndpoint ? { x: destination.x, y: oldEndpoint.y + 6 } : destination);
      }
    }
  }
  notify(text: string) { this.message = text; this.messageId++; }
  reset() {
    const volume = this.state.settings.volume;
    this.state = new ResortSimulation(initialResort(this.testMode), this.testMode).state;
    this.state.settings.volume = volume;
    this.purchase = { id: '', hold: 0, latched: false }; this.blockedNotice = ''; this.feedback = []; this.status = '';
    this.notify('Tatil köyü sıfırlandı!');
  }
  get level() { return LEVELS.filter(n => this.state.xp >= n).length; }
  get boost() { return this.state.boost.remaining > 0 ? this.state.boost.multiplier : 1; }
  get bagCapacity() { return 8; }
  upgradeMove(id: string) {
    const w = this.state.workers.find(w => w.id === id);
    if (!w || w.role === 'reception' || !atOffice(this.state.player) || this.state.settings.paused || (w.moveLevel ?? 1) >= 3) return;
    const cost = 100 * (w.moveLevel ?? 1);
    if (!this.testMode && this.state.money < cost) { this.notify('Yürüyüş yükseltmesi için para yetersiz.'); return; }
    if (!this.testMode) this.state.money -= cost;
    w.moveLevel = (w.moveLevel ?? 1) + 1;
  }
  upgradeCarry(id: string) {
    const w = this.state.workers.find(w => w.id === id); if (!w || w.role === 'reception' || !atOffice(this.state.player) || this.state.settings.paused || (w.carryLevel ?? 1) >= 3) return;
    const cost = 100 * (w.carryLevel ?? 1); if (!this.testMode && this.state.money < cost) { this.notify('Taşıma yükseltmesi için para yetersiz.'); return; }
    if (!this.testMode) this.state.money -= cost; w.carryLevel = (w.carryLevel ?? 1) + 1;
  }
  get shelfCapacity() { return [24, 36, 48][this.facility('laundry').level - 1]; }
  get machineCapacity() { return 3 + 2 * (this.facility('laundry').level - 1); }
  get areas() { return areasFor(this.state); }
  facility(id: string) { return this.state.facilities.find(f => f.id === id)!; }
  area(id: string) { return this.areas.find(a => a.id === id); }
  actor(id: string): PlayerState | WorkerState | undefined { return id === 'player' ? this.state.player : this.state.workers.find(w => w.id === id); }
  inside(p: Point, a: Point | Area) { return workAreaContains(p, a); }
  isWalkable(x: number, y: number) {
    const officeLeft = OFFICE.x - 4, officeRight = OFFICE.x + 4;
    if (x >= officeLeft && x <= officeRight && y >= 44 && y <= 50 && (y === 44 || x === officeLeft && y !== 48 || x === officeRight || y === 50 || x >= OFFICE.x - 1 && x <= OFFICE.x + 1 && y === 46)) return false;
    if (x < MAP_MIN_X || x > MAP_MAX_X || y < -3 || y >= HEIGHT - 1) return false;
    if (this.state.bar?.open && insideBar({ x, y })) return false;
    { const level = this.facility('pool').level, halfW = level >= 2 ? 6.4 : 4.8, halfD = level >= 2 ? 3.7 : 2.8; if (x >= 28.5 - halfW && x <= 28.5 + halfW && y >= 4.5 - halfD && y <= 4.5 + halfD) return false; }
    if (x >= 17 && x <= 21 && y >= 43 && y <= 44) return false;
    if (this.facility('pool').open && x >= 18 && x <= 21 && y >= 7 && y <= 8) return false;
    if (laundryObstacles(this.facility('laundry').level).some(f => inFootprint({ x, y }, f))) return false;
    // The laundry's lower edge is now a wall; its only entrance is the split
    // right-side wall, around y=45.
    if (x >= 2 && x <= 11 && y === 48) return false;
    for (const r of ROOM_DEFS) {
      if (x < r.x || x >= r.x + r.width || y < r.y || y >= r.y + r.height) continue;
      if (!this.facility(r.id).open) return false;
      const d = ROOM_DOOR(r);
      if ((x === r.x || x === r.x + 9 || y === r.y || y === r.y + 7) && !(x === d.x && y === d.y)) return false;
      // Bed and wardrobe have physical footprints; the work square stays clear.
      if (x >= r.x + 2 && x <= r.x + 4 && y >= r.y + 2 && y <= r.y + 4) return false;
      if (x === r.x + 7 && y >= r.y + 1 && y <= r.y + 2) return false;
    }
    return true;
  }
  path(from: Point, to: Point): Point[] {
    const start = { x: Math.round(from.x), y: Math.round(from.y) }, end = { x: Math.round(to.x), y: Math.round(to.y) };
    if (!this.isWalkable(end.x, end.y)) return [];
    const key = (p: Point) => `${p.x},${p.y}`, queue = [start], visited = new Set([key(start)]), previous = new Map<string, Point>();
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (key(p) === key(end)) { const result: Point[] = []; let c = p; while (key(c) !== key(start)) { result.unshift(c); c = previous.get(key(c))!; } return result; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = { x: p.x + dx, y: p.y + dy }; if (this.isWalkable(n.x, n.y) && !visited.has(key(n))) { visited.add(key(n)); previous.set(key(n), p); queue.push(n); } }
    }
    return [];
  }
  goTo(p: Point) { if (!this.state.settings.paused) this.state.player.path = this.path(this.state.player, p); }
  goToArea(id: string) { const a = this.area(id); if (a) this.goTo(a); }
  movePlayer(dx: number, dy: number, realSeconds: number) {
    if (this.state.settings.paused || (!dx && !dy)) return;
    const p = this.state.player, l = Math.hypot(dx, dy), d = 3.2 * realSeconds * this.state.settings.speed * this.boost; p.path = [];
    const x = p.x + dx / l * d, y = p.y + dy / l * d;
    if (this.isWalkable(Math.round(x), Math.round(p.y))) p.x = x;
    if (this.isWalkable(Math.round(p.x), Math.round(y))) p.y = y;
  }
  private follow(a: Actor, speed: number, dt: number) {
    let left = speed * dt;
    while (a.path.length && left > 0) { const n = a.path[0], d = distance(a, n); if (d <= left) { a.x = n.x; a.y = n.y; a.path.shift(); left -= d; } else { a.x += (n.x - a.x) / d * left; a.y += (n.y - a.y) / d * left; left = 0; } }
  }
  cost(a: Area) { return !!staffRole(a.target) ? staffHireCost(this.state.workers.length) : a.target === 'bar' ? 200 : a.mode === 'upgrade' ? upgradeCost(a.target, this.facility(a.target).level) : a.target === 'pool' ? 350 : a.target.startsWith('seat') ? 100 : ROOM_DEFS.find(r => r.id === a.target)!.cost; }
  requiredLevel(a: Area) { return a.target === 'pool' ? 4 : a.target.startsWith('seat') ? 4 : ROOM_DEFS.find(r => r.id === a.target)?.unlockLevel ?? 1; }
  purchaseProgress(a: Area): number | undefined {
    if ((a.mode !== 'buy' && a.mode !== 'upgrade') || this.purchase.id !== a.id || this.purchase.latched || !this.inside(this.state.player, a) || this.state.player.path.length) return undefined;
    if (!this.testMode && (this.level < this.requiredLevel(a) || this.state.money < this.cost(a))) return undefined;
    return Math.min(1, this.purchase.hold / 1.3);
  }
  purchaseArea(a: Area) {
    if (this.state.settings.paused || !this.inside(this.state.player, a)) return false;
    if (!!staffRole(a.target)) {
      if (this.state.workers.some(w => w.role === staffRole(a.target)) || this.state.workers.length >= 5) return false;
      const count = this.state.workers.length; this.hire(staffRole(a.target)!, true); return this.state.workers.length > count;
    }
    if (a.target === 'bar' && (!this.facility('pool').open || this.state.bar!.open)) return false;
    if (!this.testMode && this.level < this.requiredLevel(a)) { this.notify(`Seviye ${this.requiredLevel(a)} gerekli. Misafir ağırlayarak XP kazan.`); return false; }
    const cost = this.cost(a);
    if (!this.testMode && this.state.money < cost) { this.notify('Yeterli para yok. Kasadaki para yığınlarını topla.'); return false; }
    if (a.target === 'bar') this.state.bar!.open = true;
    else if (a.mode === 'upgrade') {
      const f = this.facility(a.target); if (f.level >= (f.kind === 'room' ? 2 : 3)) return false; f.level++; if (f.kind === 'pool') this.state.seats.slice(0, f.level * 2).forEach(s => { s.open = true; s.dirty = false; s.towel = true; });
    } else if (a.target.startsWith('seat')) { const seat = this.state.seats.find(s => s.id === a.target)!; if (seat.open) return false; seat.open = true; seat.dirty = false; seat.towel = true; }
    else { const f = this.facility(a.target); if (f.open) return false; f.open = true; if (f.kind === 'pool') { f.towels = 2; this.state.seats.slice(0, 2).forEach(s => { s.open = true; s.dirty = false; s.towel = true; }); } }
    if (!this.testMode) this.state.money -= cost;
    this.celebrate('build', a, a.mode === 'upgrade' ? 'YÜKSELTİLDİ!' : 'YENİ TESİS!');
    this.notify(a.mode === 'upgrade' ? `${a.label} yükseltildi! Görünüm ve verimlilik gelişti.` : `${a.label} açıldı!`); return true;
  }
  hire(role: Role = 'rooms', charge = false) {
    if (role === 'bartender') role = 'pool'; // Compatibility with older department commands.
    if (role === 'pool' && this.state.workers.some(w => w.role === 'pool')) return;
    if (!this.testMode && this.state.workers.length >= 5) { this.notify('En fazla beş çalışan alınabilir.'); return; }
    const cost = staffHireCost(this.state.workers.length); if (charge && !this.testMode && this.state.money < cost) { this.notify('İşe almak için para yetersiz.'); return; }
    if (charge && !this.testMode) this.state.money -= cost;
    const i = this.state.workers.length;
    this.state.workers.push({ id: `worker${this.state.nextId++}`, name: ['Deniz', 'Ece', 'Mert', 'Ada', 'Can'][i % 5] + (i >= 5 ? ` ${i + 1}` : ''), x: 18, y: 49, path: [], role, level: 1, moveLevel: 1, bag: { clean: 0, dirty: 0 }, status: 'İş arıyor' });
    this.notify('Yeni çalışan geldi ve kendi bölümünde çalışmaya başladı.');
  }
  upgradeWorker(id: string) { const w = this.state.workers.find(w => w.id === id); if (!w || !atOffice(this.state.player) || this.state.settings.paused || w.level >= 3) return; const cost = 120 * w.level; if (!this.testMode && this.state.money < cost) { this.notify('Eğitim için para yetersiz.'); return; } if (!this.testMode) this.state.money -= cost; w.level++; }
  assign(id: string, role: Role) { const w = this.state.workers.find(w => w.id === id); if (!w) return; if (w.task) this.cancelTask(w.task); w.role = role; w.path = []; }
  activateBoost() { if (this.state.boost.remaining > 0) { this.notify('Bonus zaten aktif; üst üste birikmez.'); return; } this.state.boost.remaining = 120; this.notify('120 saniye boyunca çalışma ve üretim %50 hızlı!'); }
  private taskArea(t: TaskState) { return this.areas.find(a => a.mode === 'work' && a.target === t.target && (a.taskKind === t.kind || a.id === `${t.target}Work` && (t.kind === 'cleanRoom' || t.kind === 'restockRoom'))); }
  isTaskActive(t: TaskState) { const actor = this.actor(t.owner), area = this.taskArea(t); return !this.state.settings.paused && !!actor && !!area && !actor.path.length && this.inside(actor, area) && serviceGuestReady(this.state, t.kind, t.guest); }
  private availableRoom() { return this.state.facilities.find(f => f.kind === 'room' && f.open && !f.dirty && !f.floorDirty && !f.bathroomDirty && !f.needsSheet && !f.guest && f.towels > 0 && !this.state.tasks.some(t => t.target === f.id)); }
  private availableSeat() { return this.state.seats.filter(s => s.open && !s.dirty && !s.guest && !this.state.tasks.some(t => t.target === s.id)).sort((a, b) => Number(!!b.towel) - Number(!!a.towel))[0]; }
  private reason(a: Area, actor: PlayerState | WorkerState): string | null {
    if (a.mode !== 'work' || !a.taskKind) return 'Çalışma alanı değil';
    if (this.state.tasks.some(t => t.owner !== actor.id && t.target === a.target && (a.target !== 'laundry' || t.kind === a.taskKind))) return 'Bu iş başka birine ait';
    const room = a.target.startsWith('room') ? this.facility(a.target) : undefined;
    if (room?.guest) return 'Misafir odada · konaklaması bekleniyor';
    switch (a.taskKind) {
      case 'cleanPool': return !this.facility('pool').open || !(this.facility('pool').dirt ?? 0) ? 'Havuz temiz' : null;
      case 'prepareDrink': return !this.state.bar?.open ? 'Bar kapalı' : actor.drink ? 'Elindeki siparişi teslim et' : !this.state.guests.some(g => wantsDrink(g) && !this.state.tasks.some(t => t.guest === g.id && (t.kind === 'prepareDrink' || t.kind === 'deliverDrink'))) ? 'Sipariş bekleniyor' : null;
      case 'deliverDrink': { const g = this.state.guests.find(g => `drink:${g.id}` === a.target); return !actor.drink ? 'Bardan siparişi al' : !g || (actor.heldProduct ?? 'lemonade') !== (g.orderProduct ?? 'lemonade') || !wantsDrink(g) || this.state.tasks.some(t => t.guest === g.id && (t.kind === 'prepareDrink' || t.kind === 'deliverDrink')) ? 'Sipariş başka birine ait veya bitmiş' : null; }
      case 'checkin': return !this.state.guests.some(g => g.phase === 'queue') ? 'Misafir bekleniyor' : !serviceGuestReady(this.state, 'checkin') ? 'Misafirin bankoya gelmesi bekleniyor' : !this.availableRoom() ? 'Hazır oda yok · temizle ve havlu bırak' : null;
      case 'cleanRoom': return actor.bag.clean + actor.bag.dirty >= towelLimit(actor) || bagCount(actor) + 2 > carryingCapacity(actor) ? 'Çanta dolu. Yatağı temizlemek için önce elindekileri bırak.' : null;
      case 'cleanFloor': return !room!.floorDirty ? 'Zemin temiz' : null;
      case 'cleanBathroom': return !room!.bathroomDirty ? 'Banyo temiz' : null;
      case 'restockRoom': return room!.towels > 0 && !room!.needsSheet ? 'Oda hazır' : room!.needsSheet && !(actor.bag.cleanSheets ?? 0) ? 'Raftan temiz çarşaf getir' : room!.towels === 0 && actor.bag.clean <= 0 ? 'Çamaşırhaneden temiz havlu getir' : null;
      case 'dirtyDrop': return dirtyLinenCount(actor.bag) <= 0 ? 'Kirli çamaşırın yok' : this.state.laundry.dirty + (this.state.laundry.dirtySheets ?? 0) >= this.shelfCapacity ? 'Kirli sepet dolu' : null;
      case 'cleanTake': return bagCount(actor) >= carryingCapacity(actor) ? 'Çanta dolu' : !((this.testMode || this.state.laundry.clean > 0) && actor.bag.clean + actor.bag.dirty < towelLimit(actor)) && !((this.testMode || (this.state.laundry.cleanSheets ?? 0) > 0) && (actor.bag.cleanSheets ?? 0) < 2 && this.state.facilities.some(f => f.kind === 'room' && (f.dirty || f.needsSheet))) ? 'Alma sınırına ulaştın veya temiz çamaşır bekleniyor' : null;
      case 'poolCheckin': return (this.facility('pool').dirt ?? 0) >= 4 ? 'Havuz bakım bekliyor' : !this.state.guests.some(g => g.phase === 'poolQueue') ? 'Havuz misafiri bekleniyor' : !serviceGuestReady(this.state, 'poolCheckin') ? 'Misafirin havuz girişine gelmesi bekleniyor' : this.facility('pool').towels <= 0 && !this.availableSeat()?.towel ? 'Havuz rafına temiz havlu getir' : !this.availableSeat() ? 'Boş temiz şezlong yok' : null;
      case 'cleanSeat': { const seat = this.state.seats.find(s => s.id === a.target)!; return seat.guest ? 'Misafir havuzda' : !seat.dirty ? 'Şezlong temiz' : actor.bag.clean + actor.bag.dirty >= towelLimit(actor) || bagCount(actor) >= carryingCapacity(actor) ? 'Çanta dolu' : null; }
      case 'poolStock': return this.facility('pool').towels >= this.shelfCapacity ? 'Havuz rafı dolu' : actor.bag.clean <= 0 ? 'Temiz havlu getir' : null;
      case 'poolDirtyDrop': return !actor.bag.dirty ? 'Kirli havlun yok' : (this.facility('pool').dirtyTowels ?? 0) >= this.shelfCapacity ? 'Havuz sepeti dolu' : null;
      case 'poolDirtyTake': return !(this.facility('pool').dirtyTowels ?? 0) ? 'Sepet boş' : actor.bag.clean + actor.bag.dirty >= towelLimit(actor) || bagCount(actor) >= carryingCapacity(actor) ? 'Çanta dolu' : null;
      case 'poolCleanTake': return !this.facility('pool').towels ? 'Havuz rafı boş' : actor.bag.clean + actor.bag.dirty >= towelLimit(actor) || bagCount(actor) >= carryingCapacity(actor) ? 'Çanta dolu' : null;
      case 'restockSeat': { const seat = this.state.seats.find(s => s.id === a.target)!; return seat.guest || seat.dirty || seat.towel ? 'Şezlong uygun değil' : !actor.bag.clean ? 'Havuz rafından havlu al' : null; }
      case 'laundryDirtyTake': return dirtyLinenCount(actor.bag) > 0 ? 'Elindeki kirli çamaşırı bırak veya makineye koy' : !(this.state.laundry.dirty + (this.state.laundry.dirtySheets ?? 0)) ? 'Kirli raf boş' : bagCount(actor) >= carryingCapacity(actor) ? 'Çanta dolu' : null;
      case 'machineLoad': return this.state.laundry.remaining === 0 || (this.state.laundry.washingTowels ?? 0) + (this.state.laundry.washingSheets ?? 0) >= this.machineCapacity ? 'Makine dolu' : !dirtyLinenCount(actor.bag) ? 'Kirli raftan çamaşır al' : null;
      case 'machineUnload': return this.state.laundry.remaining !== 0 ? 'Yıkama bekleniyor' : bagCount(actor) >= carryingCapacity(actor) || !(this.state.laundry.washingSheets ?? 0) && actor.bag.clean + actor.bag.dirty >= towelLimit(actor) ? 'Çanta dolu' : null;
      case 'laundryCleanDrop': return !actor.carryingWashed ? 'Makineden temiz çamaşır al' : actor.bag.clean && this.state.laundry.clean >= this.shelfCapacity || (actor.bag.cleanSheets ?? 0) && (this.state.laundry.cleanSheets ?? 0) >= this.shelfCapacity ? 'Temiz raf dolu' : null;
      case 'discardItem': return actor.id !== 'player' ? 'Bu kutuyu yalnızca sen kullanabilirsin' : !bagCount(actor) && !actor.drink ? 'Elinde atılacak bir şey yok' : null;
    }
  }
  startTask(a: Area, owner = 'player'): boolean {
    const actor = this.actor(owner); if (!actor || actor.task || !a.taskKind || this.reason(a, actor)) return false;
    if (owner === 'player' && (!this.inside(actor, a) || actor.path.length)) return false;
    const seconds: Record<TaskKind, number> = { checkin: 3, cleanRoom: 6, cleanFloor: 4, cleanBathroom: 5, restockRoom: .6, dirtyDrop: .6, cleanTake: .6, poolCheckin: 3, cleanSeat: 4, poolStock: .6, cleanPool: 8, prepareDrink: 3, deliverDrink: 1, poolDirtyDrop: .6, poolDirtyTake: .6, poolCleanTake: .6, restockSeat: 1, laundryDirtyTake: .6, machineLoad: .6, machineUnload: .6, laundryCleanDrop: .6, discardItem: .55 };
    const f = this.facility(a.target.startsWith('seat') || a.target.startsWith('drink:') || a.target === 'bar' || a.target === 'poolDirty' || a.target === 'poolClean' ? 'pool' : a.target), duration = seconds[a.taskKind] * taskDuration(f.level);
    const task: TaskState = { id: `task${this.state.nextId++}`, kind: a.taskKind, target: a.target, owner, remaining: duration, total: duration };
    if (a.taskKind === 'checkin') { const g = this.state.guests.find(g => g.phase === 'queue')!, r = this.availableRoom()!; task.guest = g.id; task.destination = r.id; r.guest = g.id; }
    if (a.taskKind === 'poolCheckin') { const g = this.state.guests.find(g => g.phase === 'poolQueue')!, seat = this.availableSeat()!; task.guest = g.id; task.destination = seat.id; seat.guest = g.id; }
    if (a.taskKind === 'prepareDrink') task.guest = this.state.guests.find(g => wantsDrink(g) && !this.state.tasks.some(t => t.guest === g.id && (t.kind === 'prepareDrink' || t.kind === 'deliverDrink')))!.id;
    if (a.taskKind === 'deliverDrink') task.guest = a.target.slice(6);
    this.state.tasks.push(task); actor.task = task.id;
    if (owner !== 'player') actor.path = this.path(actor, a);
    return true;
  }
  cancelTask(id: string) {
    const t = this.state.tasks.find(t => t.id === id); if (!t) return;
    if (t.kind === 'checkin' && t.destination) this.facility(t.destination).guest = undefined;
    if (t.kind === 'poolCheckin') { const seat = this.state.seats.find(s => s.id === t.destination); if (seat) seat.guest = undefined; }
    const a = this.actor(t.owner); if (a) a.task = undefined;
    this.state.tasks = this.state.tasks.filter(t => t.id !== id);
  }
  private finishTask(t: TaskState) {
    const actor = this.actor(t.owner); if (!actor) { this.cancelTask(t.id); return; }
    const g = this.state.guests.find(g => g.id === t.guest);
    switch (t.kind) {
      case 'cleanPool': { this.facility('pool').dirt = 0; this.notify('Havuz temizlendi! Misafir kabulüne hazır.'); break; }
      case 'prepareDrink': { actor.drink = true; actor.heldProduct = g?.orderProduct ?? 'lemonade'; break; }
      case 'deliverDrink': { if (!g || !wantsDrink(g) || !actor.drink || (actor.heldProduct ?? 'lemonade') !== (g.orderProduct ?? 'lemonade')) { this.cancelTask(t.id); return; } actor.drink = false; actor.heldProduct = undefined; g.drinkServed = true; const price = g.orderProduct === 'icecream' ? 22 : 15; this.state.bar!.cash += price; this.notify(`${g.orderProduct === 'icecream' ? 'Dondurma' : 'Limonata'} teslim edildi! +${price} ₺ bar kasasında.`); break; }
      case 'checkin': {
        if (!g) break; const r = this.facility(t.destination!); r.towels--; this.facility('reception').cash += Math.round(40 * incomeFactor(r.level)); g.room = r.id; g.phase = 'toRoom'; g.queueWait = 0; g.path = this.path(g, ROOM_WORK(ROOM_DEFS.find(d => d.id === r.id)!)); this.state.stats.welcomed++; this.notify('Misafir karşılandı! Bungalovuna gidiyor.'); break;
      }
      case 'cleanRoom': { const r = this.facility(t.target); if (actor.bag.clean + actor.bag.dirty >= towelLimit(actor) || bagCount(actor) + 2 > carryingCapacity(actor)) return; r.dirty = false; r.needsSheet = true; actor.bag.dirty++; actor.bag.dirtySheets = (actor.bag.dirtySheets ?? 0) + 1; this.state.stats.cleaned++; this.earnXp(5); this.notify('Kirli çarşaf ve havlu çantana alındı. Sepete götür, temiz çarşafı geri getir.'); break; }
      case 'cleanFloor': { this.facility(t.target).floorDirty = false; break; }
      case 'cleanBathroom': { this.facility(t.target).bathroomDirty = false; this.earnXp(3); break; }
      case 'restockRoom': { const r = this.facility(t.target); if (r.needsSheet && !(actor.bag.cleanSheets ?? 0) || r.towels === 0 && actor.bag.clean <= 0) return; if (r.needsSheet) { actor.bag.cleanSheets!--; r.needsSheet = false; } if (r.towels === 0) { r.towels = 1; actor.bag.clean--; } break; }
      case 'dirtyDrop': { const l = this.state.laundry; let space = this.shelfCapacity - l.dirty - (l.dirtySheets ?? 0); const towels = Math.min(actor.bag.dirty, space); actor.bag.dirty -= towels; l.dirty += towels; space -= towels; const sheets = Math.min(actor.bag.dirtySheets ?? 0, space); actor.bag.dirtySheets = (actor.bag.dirtySheets ?? 0) - sheets; l.dirtySheets = (l.dirtySheets ?? 0) + sheets; break; }
      case 'cleanTake': { const l = this.state.laundry, needsSheets = this.state.facilities.some(f => f.kind === 'room' && (f.dirty || f.needsSheet)); const sheets = needsSheets ? Math.max(0, Math.min(2 - (actor.bag.cleanSheets ?? 0), carryingCapacity(actor) - bagCount(actor), this.testMode ? 2 : l.cleanSheets ?? 0)) : 0; actor.bag.cleanSheets = (actor.bag.cleanSheets ?? 0) + sheets; if (!this.testMode) l.cleanSheets = (l.cleanSheets ?? 0) - sheets; const n = Math.max(0, Math.min(1, towelLimit(actor) - actor.bag.clean - actor.bag.dirty, carryingCapacity(actor) - bagCount(actor), this.testMode ? 4 : l.clean)); actor.bag.clean += n; if (!this.testMode) l.clean -= n; break; }
      case 'poolStock': { const pool = this.facility('pool'), n = Math.min(actor.bag.clean, this.shelfCapacity - pool.towels); actor.bag.clean -= n; pool.towels += n; break; }
      case 'poolDirtyDrop': { const pool = this.facility('pool'), n = Math.min(actor.bag.dirty, this.shelfCapacity - (pool.dirtyTowels ?? 0)); actor.bag.dirty -= n; pool.dirtyTowels = (pool.dirtyTowels ?? 0) + n; break; }
      case 'poolDirtyTake': { const pool = this.facility('pool'), n = Math.min(pool.dirtyTowels ?? 0, Math.max(0, Math.min(carryingCapacity(actor) - bagCount(actor), towelLimit(actor) - actor.bag.clean - actor.bag.dirty))); pool.dirtyTowels = (pool.dirtyTowels ?? 0) - n; actor.bag.dirty += n; break; }
      case 'poolCleanTake': { if (!this.facility('pool').towels || bagCount(actor) >= carryingCapacity(actor) || actor.bag.clean + actor.bag.dirty >= towelLimit(actor)) { this.cancelTask(t.id); return; } actor.bag.clean++; this.facility('pool').towels--; break; }
      case 'restockSeat': { actor.bag.clean--; this.state.seats.find(s => s.id === t.target)!.towel = true; break; }
      case 'laundryDirtyTake': { const l = this.state.laundry; let space = carryingCapacity(actor) - bagCount(actor); const n = Math.max(0, Math.min(l.dirty, space, towelLimit(actor) - actor.bag.clean - actor.bag.dirty)); l.dirty -= n; actor.bag.dirty += n; space -= n; const sheets = Math.min(l.dirtySheets ?? 0, space); l.dirtySheets = (l.dirtySheets ?? 0) - sheets; actor.bag.dirtySheets = (actor.bag.dirtySheets ?? 0) + sheets; break; }
      case 'machineLoad': { const l = this.state.laundry; if (l.remaining === 0 || !dirtyLinenCount(actor.bag) || (l.washingTowels ?? 0) + (l.washingSheets ?? 0) >= this.machineCapacity) { this.cancelTask(t.id); return; } let space = this.machineCapacity - (l.washingTowels ?? 0) - (l.washingSheets ?? 0); const towels = Math.min(actor.bag.dirty, space); actor.bag.dirty -= towels; space -= towels; const sheets = Math.min(actor.bag.dirtySheets ?? 0, space); actor.bag.dirtySheets = (actor.bag.dirtySheets ?? 0) - sheets; l.washingTowels = (l.washingTowels ?? 0) + towels; l.washingSheets = (l.washingSheets ?? 0) + sheets; l.washingKind = l.washingTowels ? 'towel' : 'sheet'; l.remaining = 4 * taskDuration(this.facility('laundry').level); break; }
      case 'machineUnload': { const l = this.state.laundry; if (l.remaining !== 0 || bagCount(actor) >= carryingCapacity(actor)) { this.cancelTask(t.id); return; } if (l.washingSheets) { l.washingSheets--; actor.bag.cleanSheets = (actor.bag.cleanSheets ?? 0) + 1; } else if (actor.bag.clean + actor.bag.dirty < towelLimit(actor)) { l.washingTowels = Math.max(0, (l.washingTowels ?? 1) - 1); actor.bag.clean++; } else { this.cancelTask(t.id); return; } actor.carryingWashed = true; if (!(l.washingTowels || l.washingSheets)) { l.remaining = null; l.washingKind = undefined; } else l.washingKind = l.washingTowels ? 'towel' : 'sheet'; this.state.stats.washed++; break; }
      case 'laundryCleanDrop': { const l = this.state.laundry; const n = Math.min(actor.bag.clean, Math.max(0, this.shelfCapacity - l.clean)); actor.bag.clean -= n; l.clean += n; const sheets = Math.min(actor.bag.cleanSheets ?? 0, Math.max(0, this.shelfCapacity - (l.cleanSheets ?? 0))); actor.bag.cleanSheets = (actor.bag.cleanSheets ?? 0) - sheets; l.cleanSheets = (l.cleanSheets ?? 0) + sheets; actor.carryingWashed = !!(actor.bag.clean || actor.bag.cleanSheets); break; }
      case 'discardItem': {
        if (actor.bag.dirty > 0) actor.bag.dirty--;
        else if ((actor.bag.dirtySheets ?? 0) > 0) actor.bag.dirtySheets = (actor.bag.dirtySheets ?? 0) - 1;
        else if (actor.bag.clean > 0) actor.bag.clean--;
        else if ((actor.bag.cleanSheets ?? 0) > 0) actor.bag.cleanSheets = (actor.bag.cleanSheets ?? 0) - 1;
        else if (actor.drink) { actor.drink = false; actor.heldProduct = undefined; }
        if (actor.carryingWashed && !actor.bag.clean && !(actor.bag.cleanSheets ?? 0)) actor.carryingWashed = false;
        this.notify('Elindeki bir parça çöpe atıldı.'); break;
      }
      case 'poolCheckin': { const seat = this.state.seats.find(s => s.id === t.destination)!; if (!g || !seat.towel && this.facility('pool').towels <= 0 || (this.facility('pool').dirt ?? 0) >= 4) { this.cancelTask(t.id); return; } if (!seat.towel) this.facility('pool').towels--; seat.towel = false; g.seat = t.destination; g.phase = 'toSeat'; g.queueWait = 0; g.path = this.path(g, SEAT_DEFS.find(s => s.id === t.destination)!); break; }
      case 'cleanSeat': { if (actor.bag.clean + actor.bag.dirty >= towelLimit(actor) || bagCount(actor) >= carryingCapacity(actor)) return; const s = this.state.seats.find(s => s.id === t.target)!; s.dirty = false; actor.bag.dirty++; break; }
    }
    const area = this.taskArea(t);
    if (area) this.celebrate(t.kind === 'checkin' || t.kind === 'poolCheckin' ? 'welcome' : ['cleanRoom', 'cleanFloor', 'cleanBathroom', 'cleanSeat'].includes(t.kind) ? 'clean' : 'towel', area, ['cleanRoom', 'cleanFloor', 'cleanBathroom', 'cleanSeat'].includes(t.kind) ? t.kind === 'cleanRoom' ? 'TERTEMİZ! +5 XP' : 'TERTEMİZ!' : t.kind === 'restockRoom' ? 'ODA HAZIR!' : t.kind === 'checkin' ? 'HOŞ GELDİN!' : '✓');
    actor.task = undefined; this.state.tasks = this.state.tasks.filter(x => x.id !== t.id);
  }
  private earnXp(n: number) { const before = this.level; this.state.xp += n; if (this.level > before) { this.celebrate('level', this.state.player, `SEVİYE ${this.level}!`); this.notify(`Seviye ${this.level}! Yeni satın alma alanları açıldı.`); } }
  private workerPlan(w: WorkerState) {
    if (w.task) return;
    if (w.role === 'hauling') {
      const l = this.state.laundry, all = this.areas.filter(a => a.mode === 'work');
      let kinds: TaskKind[];
      if (l.remaining === 0 && dirtyLinenCount(w.bag)) kinds = ['dirtyDrop'];
      else if (w.carryingWashed) kinds = ['laundryCleanDrop'];
      else if (w.bag.clean) {
        if (this.facility('pool').open && this.facility('pool').towels < 4) kinds = ['poolStock'];
        else { w.carryingWashed = true; kinds = ['laundryCleanDrop']; }
      }
      else if (l.remaining === 0 && bagCount(w) < carryingCapacity(w)) kinds = ['machineUnload'];
      else if (dirtyLinenCount(w.bag)) kinds = l.remaining !== 0 && (l.washingTowels ?? 0) + (l.washingSheets ?? 0) < this.machineCapacity ? ['machineLoad'] : [];
      else if (w.bag.clean && this.facility('pool').open && this.facility('pool').towels < 4) kinds = ['poolStock'];
      else if (l.dirty + (l.dirtySheets ?? 0)) kinds = ['laundryDirtyTake'];
      else if ((this.facility('pool').dirtyTowels ?? 0) > 0) kinds = ['poolDirtyTake'];
      else if (this.facility('pool').open && this.facility('pool').towels < 4) kinds = ['cleanTake'];
      else kinds = [];
      for (const a of all.filter(a => kinds.includes(a.taskKind!) && !this.reason(a, w)).sort((a, b) => distance(w, a) - distance(w, b))) {
        if (this.startTask(a, w.id)) { w.status = a.label; return; }
      }
      w.status = l.remaining !== null ? 'Makinedeki çamaşırın yıkanmasını bekliyor' : 'Kirli çamaşır / havuz taşıması bekleniyor';
      return;
    }
    if (w.role === 'reception') {
      const desk = this.area('checkin')!;
      const abandoned = this.state.tasks.find(t => t.owner === 'player' && t.kind === 'checkin');
      if (abandoned && !this.inside(this.state.player, desk)) this.cancelTask(abandoned.id);
    }
    let candidates: Area[] = [];
    const all = this.areas.filter(a => a.mode === 'work');
    if (dirtyLinenCount(w.bag) > 0 && (w.bag.clean + w.bag.dirty >= towelLimit(w) || dirtyLinenCount(w.bag) >= 3 || bagCount(w) >= carryingCapacity(w))) candidates = all.filter(a => a.taskKind === (w.role === 'pool' ? 'poolDirtyDrop' : 'dirtyDrop'));
    else {
      if (w.role === 'reception') candidates = all.filter(a => a.taskKind === 'checkin');
      if (w.role === 'rooms') {
        if (w.bag.clean && this.state.facilities.some(f => f.kind === 'room' && f.open && f.dirty) && !this.state.facilities.some(f => f.kind === 'room' && f.open && !f.guest && !f.dirty && !f.floorDirty && f.towels === 0)) {
          w.carryingWashed = true;
          const drop = all.find(a => a.taskKind === 'laundryCleanDrop')!;
          if (this.startTask(drop, w.id)) { w.status = 'Fazla temiz çamaşırı rafa bırakıyor'; return; }
        }
        candidates = all.filter(a => a.taskKind === 'cleanRoom' || a.taskKind === 'cleanFloor' || a.taskKind === 'cleanBathroom' || a.taskKind === 'restockRoom');
        if (this.facility('pool').open && !this.state.facilities.some(f => f.kind === 'room' && f.open && (f.dirty || f.floorDirty || f.needsSheet)) && !this.state.workers.some(worker => worker.role === 'hauling')) {
          if (this.facility('pool').towels < 4) candidates.push(...all.filter(a => a.taskKind === 'poolStock' || a.taskKind === 'cleanTake' && !w.bag.clean));
          candidates.push(...all.filter(a => a.taskKind === 'poolDirtyTake'));
        }
        if (this.state.facilities.some(f => f.kind === 'room' && !f.dirty && !f.floorDirty && f.open && !f.guest && (f.towels === 0 && !w.bag.clean || f.needsSheet && !(w.bag.cleanSheets ?? 0)))) candidates.push(...all.filter(a => a.taskKind === 'cleanTake'));
      }
      if (w.role === 'pool' && this.facility('pool').open) {
        candidates = all.filter(a => a.taskKind === 'poolCheckin' || a.taskKind === 'cleanSeat' || a.taskKind === 'cleanPool' || a.taskKind === 'restockSeat');
        if (!w.bag.clean && all.some(a => a.taskKind === 'restockSeat')) candidates.push(...all.filter(a => a.taskKind === 'poolCleanTake'));
        candidates.push(...all.filter(a => w.drink ? a.taskKind === 'deliverDrink' : a.taskKind === 'prepareDrink'));
      }
      if (w.role === 'bartender') candidates = all.filter(a => w.drink ? a.taskKind === 'deliverDrink' : a.taskKind === 'prepareDrink');
      if (w.role === 'pool' && (this.facility('pool').dirt ?? 0) >= 4) candidates = all.filter(a => a.taskKind === 'cleanPool');
      if (dirtyLinenCount(w.bag)) candidates.push(...all.filter(a => a.taskKind === (w.role === 'pool' ? 'poolDirtyDrop' : 'dirtyDrop')));
    }
    candidates = candidates.filter(a => !this.reason(a, w)).sort((a, b) => distance(w, a) - distance(w, b));
    if (w.role === 'rooms') {
      const take = all.find(a => a.taskKind === 'cleanTake')!;
      if (this.facility('pool').open && !this.state.workers.some(worker => worker.role === 'hauling') && this.facility('pool').towels < 4 && w.bag.clean + w.bag.dirty < towelLimit(w) && this.inside(w, take) && !this.reason(take, w)) {
        if (this.startTask(take, w.id)) { w.status = 'Havuz için havlu hazırlıyor'; return; }
      }
    }
    if (w.role === 'pool') {
      const priority = (a: Area) => a.taskKind === 'deliverDrink' ? 0 : a.taskKind === 'cleanPool' && (this.facility('pool').dirt ?? 0) >= 4 ? 1 : a.taskKind === 'prepareDrink' ? 2 : a.taskKind === 'poolCheckin' ? 3 : a.taskKind === 'poolStock' ? 4 : a.taskKind === 'cleanSeat' ? 5 : a.taskKind === 'cleanTake' ? 6 : 7;
      candidates.sort((a, b) => priority(a) - priority(b) || distance(w, a) - distance(w, b));
    }
    for (const a of candidates) if (this.startTask(a, w.id)) { w.status = a.label; return; }
    if (w.role === 'reception') {
      const desk = this.area('checkin')!;
      if (!this.inside(w, desk)) {
        if (!w.path.length) w.path = this.path(w, desk);
        w.status = 'Resepsiyona gidiyor';
      } else w.status = !this.availableRoom() ? 'Hazır oda bekleniyor' : 'Bankoda müşteri bekleniyor';
      return;
    }
    if (w.role === 'bartender' && this.state.bar?.open) { const bar = this.area('barPrepare')!; if (!this.inside(w, bar) && !w.path.length) w.path = this.path(w, bar); w.status = w.drink ? 'Yeni içecek siparişi bekleniyor' : 'Barda sipariş bekleniyor'; return; }
    w.status = 'Uygun iş / havlu bekleniyor';
  }
  private guests(dt: number) {
    this.state.spawnTimer += dt;
    // First visitor arrives promptly; subsequent arrivals retain the normal cadence.
    if (!this.state.stats.welcomed && !this.state.guests.length && this.state.spawnTimer >= 2 && this.state.elapsed < 10) this.state.spawnTimer = 10;
    if (this.state.spawnTimer >= 10) {
      this.state.spawnTimer %= 10;
      if (this.state.guests.length < 12 && this.state.guests.filter(g => g.phase === 'queue').length < 4) {
        const id = `guest${this.state.nextId++}`;
        this.state.guests.push({ id, ...guestPreferences(id), x: EXIT.x, y: EXIT.y, path: [], phase: 'queue', remaining: 0 });
      }
    }
    const queued = this.state.guests.filter(g => g.phase === 'queue'), poolQueued = this.state.guests.filter(g => g.phase === 'poolQueue');
    for (const [i, g] of queued.entries()) { const dest = receptionQueuePoint(i); if (!g.path.length && distance(g, dest) > .05) g.path = this.path(g, dest); }
    for (const [i, g] of poolQueued.entries()) { const dest = { x: 21, y: 9 + i }; if (!g.path.length && distance(g, dest) > .05) g.path = this.path(g, dest); }
    for (const g of this.state.guests) {
      if ((g.phase === 'queue' || g.phase === 'poolQueue') && !this.state.tasks.some(t => t.guest === g.id && this.isTaskActive(t))) {
        g.queueWait = (g.queueWait ?? 0) + dt;
        g.worstWait = Math.max(g.worstWait ?? 0, g.queueWait);
      }
      this.follow(g, 2, dt);
      if (g.path.length) continue;
      if (g.phase === 'toRoom') { g.phase = 'staying'; g.remaining = this.state.stats.stays < 3 ? [12, 18, 24][this.state.stats.stays] : 40; }
      else if (g.phase === 'toPool') g.phase = 'poolQueue';
      else if (g.phase === 'toSeat') { g.phase = 'swimming'; g.remaining = POOL_STAY_SECONDS; }
      else if (g.phase === 'staying' || g.phase === 'swimming') {
        g.remaining = Math.max(0, g.remaining - dt);
        if (g.phase === 'swimming' && g.wantsLemonade !== false && this.state.bar?.open && g.remaining <= POOL_STAY_SECONDS - DRINK_REQUEST_DELAY) { g.drinkRequested = true; g.orderProduct ??= this.facility('pool').level >= 2 && g.id.charCodeAt(g.id.length - 1) % 2 === 0 ? 'icecream' : 'lemonade'; }
        if (g.remaining > 0) continue;
        if (g.phase === 'staying') {
          const r = this.facility(g.room!); r.guest = undefined; r.dirty = true; r.floorDirty = true; if (r.level >= 2) r.bathroomDirty = true; r.tips = (r.tips ?? 0) + guestTip(g) + (r.level >= 2 ? 3 : 0);
          this.state.stats.stays++; this.earnXp(10);
          const pending = this.state.guests.filter(g => ['toPool', 'poolQueue'].includes(g.phase)).length;
          const seats = this.state.seats.filter(s => s.open && !s.dirty && !s.guest).length;
          if (g.visitsPool !== false && this.facility('pool').open && seats > pending) { g.phase = 'toPool'; g.path = this.path(g, { x: 21, y: 9 }); } else { g.phase = 'leaving'; g.path = this.path(g, EXIT); }
        } else {
          const seat = this.state.seats.find(s => s.id === g.seat)!; seat.guest = undefined; seat.dirty = true;
          this.facility('pool').dirt = Math.min(4, (this.facility('pool').dirt ?? 0) + 1);
          for (const task of [...this.state.tasks]) if (task.guest === g.id && (task.kind === 'prepareDrink' || task.kind === 'deliverDrink')) this.cancelTask(task.id);
          g.drinkRequested = false; g.orderProduct = undefined;
          this.facility('pool').cash += Math.round(20 * incomeFactor(this.facility('pool').level)); this.state.stats.poolVisits++; this.earnXp(5); g.phase = 'leaving'; g.path = this.path(g, EXIT);
        }
      }
    }
    this.state.guests = this.state.guests.filter(g => g.phase !== 'leaving' || distance(g, EXIT) > .1);
  }
  tick(realSeconds: number) {
    if (this.state.settings.paused) return;
    const dt = Math.min(.25, Math.max(0, realSeconds)) * this.state.settings.speed; this.state.elapsed += dt;
    this.state.boost.remaining = Math.max(0, this.state.boost.remaining - dt);
    if (this.testMode) { this.state.laundry.cleanSheets = Math.max(999, this.state.laundry.cleanSheets ?? 0); this.state.money = 999999; this.state.laundry.clean = Math.max(this.state.laundry.clean, 999); if (this.facility('pool').open) this.facility('pool').towels = Math.max(999, this.facility('pool').towels); }
    this.follow(this.state.player, 3.2 * this.boost, dt); this.guests(dt);
    for (const a of this.areas.filter(a => a.mode === 'cash')) { const f = a.target === 'bar' ? this.state.bar! : this.facility(a.target); if (f.cash > 0 && distance(this.state.player, a) < 1.2) { const n = f.cash; this.state.money += n; this.state.stats.earned += n; f.cash = 0; this.celebrate('cash', a, `+${n} ₺`); this.notify(`+${n} para topladın!`); } }
    for (const r of ROOM_DEFS) {
      const f = this.facility(r.id), tipPoint = { x: r.x + 7, y: r.y + 1.5 };
      if ((f.tips ?? 0) > 0 && distance(this.state.player, tipPoint) <= 1.65) {
        const amount = f.tips!; f.tips = 0; this.state.money += amount; this.state.stats.earned += amount;
        this.celebrate('cash', tipPoint, `+${amount} ₺`); this.notify(`+${amount} ₺ bahşiş topladın!`);
      }
    }
    const p = this.state.player;
    const nearby = this.areas.filter(a => a.mode !== 'cash' && this.inside(p, a));
    const delivery = p.drink ? nearby.find(a => a.taskKind === 'deliverDrink' && !this.reason(a, p)) : undefined;
    const at = delivery ?? nearby.find(a => a.id === 'poolStock' && p.bag.clean > 0 && !this.reason(a, p)) ?? nearby.find(a => a.mode === 'work' && !this.reason(a, p)) ?? nearby[0];
    if (at && !p.path.length) {
      if (at.mode === 'buy' || at.mode === 'upgrade') {
        if (this.purchase.id !== at.id) this.purchase = { id: at.id, hold: 0, latched: false };
        this.purchase.hold += dt;
        this.status = `${at.label} · ${this.cost(at)} para · ${Math.min(100, Math.floor(this.purchase.hold / 1.3 * 100))}%`;
        if (this.purchase.hold >= 1.3 && !this.purchase.latched) {
          this.purchase.latched = true; this.purchaseArea(at);
        }
        if (!!staffRole(at.target) && !this.state.workers.some(w => w.role === staffRole(at.target)) && this.state.workers.length < 5 && (this.testMode || this.state.money >= this.cost(at))) this.purchase.latched = false;
      } else {
        this.purchase = { id: '', hold: 0, latched: false };
        // A pending next towel must not block the job we walked over to do.
        const pending = this.state.tasks.find(t => t.id === p.task);
        // Leaving pauses a job; deliberately starting another releases its reservation.
        if (pending && (pending.target !== at.target || pending.kind !== at.taskKind) && !this.reason(at, p)) this.cancelTask(pending.id);
        if (pending && (pending.kind === 'cleanTake' || pending.kind === 'poolCleanTake') && at.taskKind !== pending.kind) this.cancelTask(pending.id);
        if (delivery && pending && pending.kind !== 'deliverDrink') this.cancelTask(pending.id);
        if (!p.task) {
          const reason = this.reason(at, p);
          this.status = reason ?? at.label;
          if (reason) {
            const noticeKey = `${at.id}:${reason}`;
            if (this.blockedNotice !== noticeKey) { this.blockedNotice = noticeKey; this.notify(reason); }
          } else {
            this.blockedNotice = '';
            this.startTask(at);
          }
        }
      }
    } else { this.purchase = { id: '', hold: 0, latched: false }; const task = this.state.tasks.find(t => t.id === p.task); this.status = p.task ? task?.kind === 'cleanRoom' || task?.kind === 'restockRoom' ? 'Görev bekliyor · yatağın yanına dön' : 'Görev bekliyor · çalışma karesine dön' : 'Beyaz karede dur · otomatik çalış'; }
    for (const w of this.state.workers) {
      this.workerPlan(w);
      const t = this.state.tasks.find(t => t.id === w.task), a = t ? this.taskArea(t) : undefined;
      // Saved routes may end at a work area that has since moved (e.g. the old front-of-desk pad).
      if (a && !w.path.length && !this.inside(w, a)) w.path = this.path(w, a);
      this.follow(w, workerMoveSpeed(w) * this.boost, dt);
    }
    for (const t of [...this.state.tasks]) {
      const actor = this.actor(t.owner), a = this.taskArea(t); if (!actor || !a) { this.cancelTask(t.id); continue; }
      if (!this.isTaskActive(t)) { if (t.owner === 'player' && (t.kind === 'checkin' || t.kind === 'poolCheckin') && !serviceGuestReady(this.state, t.kind, t.guest)) this.status = 'Misafirin hizmet noktasına gelmesi bekleniyor'; continue; }
      const efficiency = t.owner === 'player' ? 1 : [.65, .8, 1][(actor as WorkerState).level - 1];
      t.remaining = Math.max(0, t.remaining - dt * efficiency * this.boost);
      if (t.owner === 'player') this.status = `${a.label} · ${Math.round((1 - t.remaining / t.total) * 100)}%`;
      if (t.remaining === 0) this.finishTask(t);
    }
    const l = this.state.laundry;
    if (l.remaining !== null) l.remaining = Math.max(0, l.remaining - dt * this.boost);
  }
}
