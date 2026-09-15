import { BAG_CAPACITY, BUILDINGS, CONTRACTS, MAP_HEIGHT, MAP_WIDTH, RESOURCE_IDS, RESOURCES, WORKER_NAMES } from './data';
import type { BuildingKind, BuildingState, GameState, Inventory, Point, Resource, WorkerState } from './types';
import { LEVEL_XP, ROOMS, facilityLevel, roomAt, roomBuildings, roomForKind, wallCell } from './facility';

export const count = (inventory: Inventory): number => Object.values(inventory).reduce((a, b) => a + (b ?? 0), 0);
export const has = (inventory: Inventory, needs: Inventory) => RESOURCE_IDS.every(r => (inventory[r] ?? 0) >= (needs[r] ?? 0));
export function change(target: Inventory, source: Inventory, sign = 1) { for (const r of RESOURCE_IDS) target[r] = Math.max(0, (target[r] ?? 0) + (source[r] ?? 0) * sign); }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function initialState(): GameState {
  const placements: [BuildingKind, number, number][] = [
    ...ROOMS[0].stations, ['warehouse', 9, 33], ['shop', 15, 33]
  ];
  return {
    version: 1, layout: 'facility-v1', rooms: ['recycling'], xp: 0, money: 650, elapsed: 0, player: { x: 16, y: 36, bag: {}, path: [] }, workers: [],
    buildings: placements.map(([kind, x, y], i) => ({ id: `b${i}`, kind, x, y, rotated: false, level: 1, output: {} })),
    inventory: { waste: 9 }, contract: { definitionId: 'sorting', remaining: 240 }, completedContracts: 0,
    boost: { multiplier: 1.5, remaining: 0 }, stats: { produced: {}, delivered: {}, collected: 0 }, milestones: 0,
    settings: { paused: false, speed: 1 }, nextId: 20, homeNeedTimer: 0
  };
}

export class Simulation {
  message = 'İşletmene hoş geldin! Kare çalışma alanında dur; işler otomatik yapılır. Deneyim kazan ve yeni odalar aç.';
  messageId = 0;
  private wasteTimer = 0;
  private workAreaId = '';
  private workAreaTimer = 0;
  workAreaStatus = 'Kare çalışma alanında dur';
  get workAreaProgress() { return Math.min(1, this.workAreaTimer / .6); }
  inWorkArea(b: BuildingState) { const e = this.entrance(b), p = this.state.player; return Math.abs(p.x - e.x) <= .5 && Math.abs(p.y - e.y) <= .5; }
  private automaticWork(dt: number) {
    const b = this.state.buildings.find(b => this.inWorkArea(b));
    if (!b || this.state.player.path.length) { this.workAreaId = ''; this.workAreaTimer = 0; this.workAreaStatus = 'Kare çalışma alanında dur'; return; }
    if (this.workAreaId !== b.id) { this.workAreaId = b.id; this.workAreaTimer = 0; }
    if (b.job) {
      this.workAreaStatus = b.job.owner === 'player' ? 'Çalışılıyor…' : 'Çalışan bu tezgâhı kullanıyor';
      if (b.job.owner === 'player') this.resumeJob(b.id);
      this.workAreaTimer = 0; return;
    }
    this.workAreaTimer += dt;
    if (this.workAreaTimer < .6) { this.workAreaStatus = 'Otomatik işlem…'; return; }
    this.workAreaTimer = 0;
    if (b.kind === 'warehouse') {
      this.workAreaStatus = count(this.state.player.bag) ? count(this.state.inventory) >= this.capacity ? 'Depo dolu' : 'Depoya bırakılıyor' : 'Çanta boş';
      if (count(this.state.player.bag) && count(this.state.inventory) < this.capacity) this.deposit(b.id);
    } else if (b.kind === 'shop') {
      const total = { ...this.state.inventory }; change(total, this.state.player.bag);
      this.workAreaStatus = has(total, this.contract.inputs) ? 'Sipariş teslim ediliyor' : 'Sipariş malzemeleri eksik';
      if (has(total, this.contract.inputs)) this.deliverContract(b.id);
    } else if (b.kind === 'home') {
      const ready = (['meal', 'furniture', 'electricity'] as Resource[]).some(r => (this.state.inventory[r] ?? 0) + (this.state.player.bag[r] ?? 0) > 0);
      this.workAreaStatus = ready ? 'İhtiyaçlar teslim ediliyor' : 'Teslim edilecek ürün yok';
      if (ready) this.serveHome(b.id);
    } else if (count(b.output)) {
      this.workAreaStatus = count(this.state.player.bag) >= this.bagCapacity ? 'Çanta dolu · depoya götür' : 'Ürünler çantaya alınıyor';
      if (count(this.state.player.bag) < this.bagCapacity) {
        const moved = this.transfer(b.output, this.state.player.bag, this.bagCapacity, undefined, b.kind === 'collection' ? 3 : Infinity);
        if (b.kind === 'collection') this.state.stats.collected += moved;
      }
    } else if (b.kind === 'collection') this.workAreaStatus = 'Atık birikmesi bekleniyor';
    else {
      this.workAreaStatus = this.startJob(b.id, 'player', true) ? 'Çalışılıyor…' : 'Malzeme veya boş tezgâh bekleniyor';
    }
  }
  constructor(public state: GameState = initialState(), readonly testMode = false) {}
  notify(message: string) { this.message = message; this.messageId++; }
  get capacity() { return this.testMode ? Infinity : this.state.buildings.filter(b => b.kind === 'warehouse').reduce((n, b) => n + b.level * 100, 0); }
  get bagCapacity() { return this.testMode ? Infinity : BAG_CAPACITY; }
  get outputCapacity() { return this.testMode ? Infinity : 16; }
  private spend(amount: number) { if (!this.testMode) this.state.money -= amount; }
  get multiplier() { return this.state.boost.remaining > 0 ? this.state.boost.multiplier : 1; }
  get level() { return facilityLevel(this.state.xp); }
  get nextLevelXp() { return LEVEL_XP[this.level] ?? this.state.xp; }
  roomOpen(id: string) { return this.state.rooms.includes(id); }
  roomUnlockable(id: string) { const r = ROOMS.find(r => r.id === id); return !!r && !this.roomOpen(id) && this.level >= r.level && (!r.requires || this.roomOpen(r.requires)); }
  unlockRoom(id: string) {
    const r = ROOMS.find(r => r.id === id); if (!r || this.roomOpen(id) || this.state.settings.paused) return false;
    if (!this.roomUnlockable(id)) { this.notify(`Bu bölüm seviye ${r.level} ve önceki odası açılınca kullanılabilir.`); return false; }
    if (distance(this.state.player, r.gate) > 1.2) { this.goTo(r.gate); this.notify('Odayı açmak için koridordaki satın alma alanına gidiyorsun.'); return false; }
    if (!this.testMode && this.state.money < r.cost) { this.notify('Odayı açmak için yeterli yaprağın yok. Geri dönüşüm yap veya sipariş teslim et.'); return false; }
    this.spend(r.cost); this.state.rooms.push(id);
    this.state.buildings.push(...roomBuildings(r, () => `b${this.state.nextId++}`));
    this.state.player.path = []; this.state.workers.forEach(w => w.path = []);
    this.notify(`${r.name} açıldı! İçeri gir; ekipmanlar çalışmaya hazır.`); return true;
  }
  private earnXp(amount: number) { const before = this.level; this.state.xp += amount; if (this.level > before) this.notify(`Seviye ${this.level}! Koridordaki yeni bölümleri açabilirsin.`); }
  get contract() { return CONTRACTS.find(c => c.id === this.state.contract.definitionId)!; }
  get contractReward() { const level = Math.max(1, ...this.state.buildings.filter(b => b.kind === 'shop').map(b => b.level)); return Math.round(this.contract.reward * (1 + (level - 1) * 0.2)); }
  get happiness() { return Math.min(100, 45 + this.state.completedContracts * 5 + Math.min(20, (this.state.stats.delivered.meal ?? 0) * 2) + Math.min(15, this.state.stats.delivered.electricity ?? 0) + Math.min(15, (this.state.stats.delivered.furniture ?? 0) * 3)); }
  building(id: string) { return this.state.buildings.find(b => b.id === id); }
  footprint(b: BuildingState) { const def = BUILDINGS[b.kind]; return { width: b.rotated ? def.height : def.width, height: b.rotated ? def.width : def.height }; }
  entrance(b: BuildingState): Point { const size = this.footprint(b); return { x: b.x + Math.floor(size.width / 2), y: b.y + size.height }; }
  isWalkable(x: number, y: number) {
    if (x < 1 || y < 1 || x >= MAP_WIDTH - 1 || y >= MAP_HEIGHT - 1) return false;
    const room = roomAt(x, y);
    if (room && (!this.roomOpen(room.id) || wallCell(room, x, y))) return false;
    if (!room && !(x >= 14 && x <= 19) && y < 33) return false;
    return !this.state.buildings.some(b => { const s = this.footprint(b); return x >= b.x && x < b.x + s.width && y >= b.y && y < b.y + s.height; });
  }
  path(from: Point, to: Point): Point[] {
    const start = { x: Math.round(from.x), y: Math.round(from.y) }, end = { x: Math.round(to.x), y: Math.round(to.y) };
    if (!this.isWalkable(end.x, end.y)) return [];
    const key = (p: Point) => `${p.x},${p.y}`;
    const queue: Point[] = [start], visited = new Set([key(start)]), previous = new Map<string, Point>();
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (key(current) === key(end)) {
        const result: Point[] = []; let cursor = current;
        while (key(cursor) !== key(start)) { result.unshift(cursor); cursor = previous.get(key(cursor))!; }
        return result;
      }
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (this.isWalkable(next.x, next.y) && !visited.has(key(next))) { visited.add(key(next)); previous.set(key(next), current); queue.push(next); }
      }
    }
    return [];
  }
  goTo(point: Point) {
    if (this.state.player.activeBuilding) this.cancelPlayerJob();
    this.state.player.path = this.path(this.state.player, point);
  }
  goToBuilding(id: string) { const b = this.building(id); if (b && !(this.state.player.activeBuilding === id && this.nearby(b))) this.goTo(this.entrance(b)); }
  nearby(b: BuildingState) { return distance(this.state.player, this.entrance(b)) < 1.2; }
  movePlayer(dx: number, dy: number, seconds: number) {
    if (this.state.settings.paused || (!dx && !dy)) return;
    if (this.state.player.activeBuilding) this.cancelPlayerJob();
    this.state.player.path = [];
    const length = Math.hypot(dx, dy) || 1, speed = 3.2 * this.multiplier * this.state.settings.speed;
    const p = this.state.player;
    const nx = p.x + dx / length * speed * seconds, ny = p.y + dy / length * speed * seconds;
    if (this.isWalkable(Math.round(nx), Math.round(p.y))) p.x = Math.max(0, Math.min(MAP_WIDTH - 1, nx));
    if (this.isWalkable(Math.round(p.x), Math.round(ny))) p.y = Math.max(0, Math.min(MAP_HEIGHT - 1, ny));
  }
  private follow(actor: Point & { path: Point[] }, speed: number, dt: number) {
    let remaining = speed * dt;
    while (actor.path.length && remaining > 0) {
      const next = actor.path[0], d = distance(actor, next);
      if (d <= remaining) { actor.x = next.x; actor.y = next.y; actor.path.shift(); remaining -= d; }
      else { actor.x += (next.x - actor.x) / d * remaining; actor.y += (next.y - actor.y) / d * remaining; remaining = 0; }
    }
  }
  startJob(id: string, owner = 'player', silent = false): boolean {
    const b = this.building(id); if (!b) return false;
    const recipe = BUILDINGS[b.kind].recipe;
    const fail = (message: string) => { if (!silent) this.notify(message); return false; };
    if (this.state.settings.paused) return fail('Üretim için oyunu devam ettir.');
    if (!recipe) return fail('Bu binada üretim yapılmıyor.');
    if (b.job) return fail('Bu istasyonda biri çalışıyor.');
    if (owner === 'player' && !this.nearby(b)) { this.goToBuilding(id); return fail('Karakterin binaya gidiyor. Yaklaşınca üretimi başlat.'); }
    if (owner === 'player' && this.state.player.activeBuilding) return fail('Önce mevcut görevi tamamla.');
    if (count(b.output) + count(recipe.outputs) > this.outputCapacity) return fail('İstasyon dolu. Ürünleri topla ve depoya taşı.');
    if (b.kind === 'collection' && (b.output.waste ?? 0) < 3) return fail('Atık henüz birikmedi. Biraz bekle.');
    const available = { ...this.state.inventory };
    if (owner === 'player') change(available, this.state.player.bag);
    if (!this.testMode && !has(available, recipe.inputs)) return fail('Yeterli malzeme yok. Zincirin önceki adımını üret ve depoya taşı.');
    // Inputs are reserved immediately, so a second actor cannot consume the same items.
    if (!this.testMode) for (const r of RESOURCE_IDS) {
      let need = recipe.inputs[r] ?? 0;
      if (owner === 'player') { const take = Math.min(need, this.state.player.bag[r] ?? 0); this.state.player.bag[r] = (this.state.player.bag[r] ?? 0) - take; need -= take; }
      this.state.inventory[r] = (this.state.inventory[r] ?? 0) - need;
    }
    if (b.kind === 'collection') { b.output.waste = (b.output.waste ?? 0) - 3; }
    b.job = { owner, remaining: recipe.duration, total: recipe.duration };
    if (owner === 'player') { this.state.player.activeBuilding = id; this.state.player.path = []; }
    if (!silent) this.notify(`${BUILDINGS[b.kind].name}: çalışmaya başladın.`);
    return true;
  }
  cancelPlayerJob() {
    const id = this.state.player.activeBuilding, b = id ? this.building(id) : undefined;
    if (b?.job?.owner === 'player') {
      // A paused job remains reserved and can be resumed at the station.
      this.notify('Görev bekliyor. Kare çalışma alanına dönünce otomatik devam eder.');
    }
    this.state.player.activeBuilding = undefined;
  }
  resumeJob(id: string) { const b = this.building(id); if (b?.job?.owner === 'player' && this.nearby(b) && !this.state.player.activeBuilding) { this.state.player.activeBuilding = id; return true; } return false; }
  transfer(from: Inventory, to: Inventory, capacity: number, resource?: Resource, max = Infinity) {
    let free = Math.max(0, capacity - count(to)), moved = 0;
    for (const r of resource ? [resource] : RESOURCE_IDS) { const amount = Math.min(from[r] ?? 0, free, max - moved); if (amount > 0) { from[r] = (from[r] ?? 0) - amount; to[r] = (to[r] ?? 0) + amount; free -= amount; moved += amount; } }
    return moved;
  }
  collect(id: string) {
    const b = this.building(id); if (!b) return;
    if (!this.nearby(b)) { this.goToBuilding(id); this.notify('Ürünleri almak için binaya yaklaşıyorsun.'); return; }
    const n = this.transfer(b.output, this.state.player.bag, this.bagCapacity);
    if (b.kind === 'collection') this.state.stats.collected += n;
    this.notify(n ? `${n} ürün çantana alındı. Depoya bırak veya üretimde kullan.` : 'Toplanacak ürün yok veya çantan dolu.');
  }
  deposit(id: string) {
    const b = this.building(id); if (!b || b.kind !== 'warehouse') return;
    if (!this.nearby(b)) { this.goToBuilding(id); this.notify('Çantanı boşaltmak için depoya gidiyorsun.'); return; }
    const n = this.transfer(this.state.player.bag, this.state.inventory, this.capacity);
    this.notify(n ? `${n} ürün depoya bırakıldı.` : 'Çantan boş veya depo dolu.');
  }
  take(id: string, resource: Resource) {
    const b = this.building(id); if (!b || !this.nearby(b)) { this.goToBuilding(id); return; }
    const n = this.transfer(this.state.inventory, this.state.player.bag, this.bagCapacity, resource, 3);
    this.notify(n ? `${n} ${RESOURCES[resource].name} çantana alındı.` : 'Yeterli stok veya çanta alanı yok.');
  }
  hire() {
    if (!this.testMode && this.state.workers.length >= 5) { this.notify('Prototipte en fazla 5 çalışan olabilir.'); return; }
    const cost = 100 + this.state.workers.length * 30;
    if (!this.testMode && this.state.money < cost) { this.notify('Çalışan işe almak için yeterli bütçe yok.'); return; }
    this.spend(cost);
    const index = this.state.workers.length;
    this.state.workers.push({ id: `w${this.state.nextId++}`, name: WORKER_NAMES[index % WORKER_NAMES.length] + (index >= 5 ? ` ${Math.floor(index / 5) + 1}` : ''), x: 16, y: 36, level: 1, phase: 'idle', carrying: {}, path: [] });
    this.notify('Yeni çalışan geldi. Ekip panelinden bir üretim binası ata.');
  }
  assign(workerId: string, buildingId: string) {
    const w = this.state.workers.find(w => w.id === workerId), b = this.building(buildingId); if (!w) return;
    if (count(w.carrying)) { this.notify('Önce çalışanın taşıdığı ürünleri depoya bırakmasını bekle.'); return; }
    if (b && (!BUILDINGS[b.kind].workerSlots || this.state.workers.some(other => other.id !== workerId && other.assignedBuilding === buildingId))) { this.notify('Bu istasyonun çalışan yeri dolu veya çalışan kabul etmiyor.'); return; }
    if (w.assignedBuilding) { const old = this.building(w.assignedBuilding); if (old?.job?.owner === w.id) { const refund = { ...BUILDINGS[old.kind].recipe!.inputs }; this.transfer(refund, this.state.inventory, this.capacity); change(old.output, refund); old.job = undefined; } }
    w.assignedBuilding = b?.id; w.path = []; w.phase = 'idle';
    this.notify(`${w.name}: ${b ? BUILDINGS[b.kind].name : 'boşta'} görevine atandı.`);
  }
  upgradeWorker(id: string) {
    const w = this.state.workers.find(w => w.id === id); if (!w) return;
    const cost = w.level * 120;
    if (w.level >= 3) { this.notify('Çalışan en yüksek seviyede.'); return; }
    if (!this.testMode && this.state.money < cost) { this.notify('Eğitim için bütçe yetersiz.'); return; }
    this.spend(cost); w.level++; this.notify(`${w.name} seviye ${w.level}! Daha hızlı çalışıyor.`);
  }
  upgradeBuilding(id: string) {
    const b = this.building(id); if (!b) return;
    if (this.state.settings.paused) return;
    if (!this.nearby(b)) { this.goToBuilding(id); this.notify('Yükseltmek için ekipmanın yanına gidiyorsun.'); return; }
    const cost = Math.round(BUILDINGS[b.kind].cost * 0.65 * b.level);
    if (b.level >= 3) { this.notify('Bina en yüksek seviyede.'); return; }
    if (!this.testMode && this.state.money < cost) { this.notify('Yükseltme için bütçe yetersiz.'); return; }
    this.spend(cost); b.level++; this.notify('Bina yükseltildi. Üretim verimliliği arttı.');
  }
  placementValid(kind: BuildingKind, x: number, y: number, rotated: boolean) {
    const candidate: BuildingState = { id: 'preview', kind, x, y, rotated, level: 1, output: {} }, s = this.footprint(candidate);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1 || x + s.width >= MAP_WIDTH || y + s.height >= MAP_HEIGHT) return false;
    const room = roomForKind(kind);
    if (room && (!this.roomOpen(room.id) || roomAt(x, y)?.id !== room.id || roomAt(x + s.width - 1, y + s.height)?.id !== room.id)) return false;
    if (!room && (y < 33 || x < 2 || x + s.width > 32 || y + s.height > 36)) return false;
    for (let tx = x; tx < x + s.width; tx++) for (let ty = y; ty < y + s.height; ty++) {
      if (!this.isWalkable(tx, ty) || distance({ x: tx, y: ty }, this.state.player) < 0.8 || this.state.workers.some(w => distance(w, { x: tx, y: ty }) < 0.8)) return false;
      if (this.state.buildings.some(b => { const e = this.entrance(b); return e.x === tx && e.y === ty; })) return false;
    }
    const e = this.entrance(candidate);
    if (!this.isWalkable(e.x, e.y)) return false;
    // Verify that placing the footprint preserves access to all existing entrances.
    this.state.buildings.push(candidate);
    const valid = this.state.buildings.every(b => distance(this.state.player, this.entrance(b)) < 0.5 || this.path(this.state.player, this.entrance(b)).length > 0);
    this.state.buildings.pop(); return valid;
  }
  build(kind: BuildingKind, x: number, y: number, rotated: boolean) {
    if (this.state.settings.paused) return false;
    if (!this.placementValid(kind, x, y, rotated)) { this.notify('Buraya inşa edilemez. Boş alanı ve bina girişlerini koru.'); return false; }
    if (!this.testMode && this.state.money < BUILDINGS[kind].cost) { this.notify('İnşa için bütçen yetersiz.'); return false; }
    this.spend(BUILDINGS[kind].cost);
    this.state.buildings.push({ id: `b${this.state.nextId++}`, kind, x, y, rotated, level: 1, output: {} });
    this.state.player.path = []; for (const w of this.state.workers) w.path = [];
    this.notify(`${BUILDINGS[kind].name} inşa edildi.`); return true;
  }
  deliverContract(id: string) {
    const b = this.building(id); if (!b || b.kind !== 'shop') return;
    if (!this.nearby(b)) { this.goToBuilding(id); this.notify('Teslimat için kooperatife gidiyorsun.'); return; }
    const total = { ...this.state.inventory }; change(total, this.state.player.bag);
    if (!has(total, this.contract.inputs)) { this.notify('Sipariş ürünleri eksik. Depo ve çantandaki ürünler birlikte kullanılabilir.'); return; }
    for (const r of RESOURCE_IDS) { let need = this.contract.inputs[r] ?? 0; const bag = Math.min(need, this.state.player.bag[r] ?? 0); this.state.player.bag[r] = (this.state.player.bag[r] ?? 0) - bag; need -= bag; this.state.inventory[r] = (this.state.inventory[r] ?? 0) - need; }
    const reward = this.contractReward;
    this.state.money += reward; this.state.completedContracts++; change(this.state.stats.delivered, this.contract.inputs);
    this.notify(`Sözleşme tamamlandı! +${reward} yaprak kazandın.`);
    this.earnXp(20);
    const kinds = new Set(this.state.buildings.map(b => b.kind));
    const available = CONTRACTS.filter(c => Object.keys(c.inputs).every(resource => this.state.buildings.some(b => (BUILDINGS[b.kind].recipe?.outputs[resource as Resource] ?? 0) > 0)) && (c.id !== 'festival' || kinds.has('generator')));
    const next = available[this.state.completedContracts % available.length];
    this.state.contract = { definitionId: next.id, remaining: next.seconds };
  }
  serveHome(id: string) {
    const b = this.building(id); if (!b || b.kind !== 'home') return;
    if (!this.nearby(b)) { this.goToBuilding(id); this.notify('Komşularına teslimat için eve gidiyorsun.'); return; }
    let reward = 0;
    for (const [r, value] of [['meal', 18], ['furniture', 45], ['electricity', 10]] as [Resource, number][]) {
      const source = (this.state.player.bag[r] ?? 0) > 0 ? this.state.player.bag : this.state.inventory;
      if ((source[r] ?? 0) > 0) { source[r] = (source[r] ?? 0) - 1; this.state.stats.delivered[r] = (this.state.stats.delivered[r] ?? 0) + 1; reward += value; }
    }
    reward = Math.round(reward * (1 + (b.level - 1) * 0.25));
    this.state.money += reward; this.notify(reward ? `Komşular mutlu! +${reward} yaprak.` : 'Teslim edilecek yemek, mobilya veya enerji yok.');
    if (reward) this.earnXp(10);
  }
  private workerUpdate(w: WorkerState, dt: number) {
    const speed = (1.7 + (w.level - 1) * 0.35) * this.multiplier;
    this.follow(w, speed, dt);
    if (w.path.length) return;
    const depot = this.state.buildings.filter(b => b.kind === 'warehouse').sort((a, b) => distance(w, this.entrance(a)) - distance(w, this.entrance(b)))[0];
    if (count(w.carrying) > 0) {
      w.phase = 'hauling';
      if (!depot) return;
      if (distance(w, this.entrance(depot)) > 0.4) { w.path = this.path(w, this.entrance(depot)); return; }
      this.transfer(w.carrying, this.state.inventory, this.capacity);
      if (count(w.carrying)) return;
    }
    const b = w.assignedBuilding ? this.building(w.assignedBuilding) : undefined;
    if (!b) { w.phase = 'idle'; return; }
    if (distance(w, this.entrance(b)) > 0.4) { w.path = this.path(w, this.entrance(b)); w.phase = 'walking'; return; }
    if (count(b.output) > 0) { const moved = this.transfer(b.output, w.carrying, 6); if (b.kind === 'collection') this.state.stats.collected += moved; w.phase = 'hauling'; return; }
    if (!b.job && b.kind !== 'collection') this.startJob(b.id, w.id, true);
    w.phase = b.job?.owner === w.id ? 'working' : 'idle';
  }
  tick(realSeconds: number) {
    if (this.state.settings.paused) return;
    const dt = Math.max(0, Math.min(realSeconds, 0.25)) * this.state.settings.speed;
    this.state.elapsed += dt; this.wasteTimer += dt;
    if (this.testMode) { this.state.money = 999999; for (const r of RESOURCE_IDS) this.state.inventory[r] = 999999; this.state.buildings.filter(b => b.kind === 'collection').forEach(b => b.output.waste = 999999); }
    if (!this.testMode) this.state.boost.remaining = Math.max(0, this.state.boost.remaining - dt);
    if (!this.testMode) this.state.contract.remaining = Math.max(0, this.state.contract.remaining - dt);
    if (this.state.contract.remaining === 0) { this.state.contract.remaining = this.contract.seconds; this.notify('Sözleşme süresi geçti. Ceza yok; şehir sana bir şans daha verdi.'); }
    if (this.wasteTimer >= 8) { this.wasteTimer %= 8; for (const b of this.state.buildings.filter(b => b.kind === 'collection')) b.output.waste = Math.min(this.testMode ? Infinity : 15, (b.output.waste ?? 0) + 3 * b.level); }
    this.follow(this.state.player, 3.2 * this.multiplier, dt);
    this.automaticWork(dt);
    for (const w of this.state.workers) this.workerUpdate(w, dt);
    for (const b of this.state.buildings) {
      if (!b.job) continue;
      let efficiency = 0;
      if (b.job.owner === 'player' && this.state.player.activeBuilding === b.id && this.nearby(b)) efficiency = 1;
      const worker = this.state.workers.find(w => w.id === b.job!.owner);
      if (worker && distance(worker, this.entrance(b)) < 0.4 && worker.phase === 'working') efficiency = 0.65 + (worker.level - 1) * 0.15;
      b.job.remaining = Math.max(0, b.job.remaining - dt * efficiency * this.multiplier * (1 + (b.level - 1) * 0.25));
      if (b.job.remaining === 0) {
        const output = BUILDINGS[b.kind].recipe!.outputs;
        if (count(b.output) + count(output) > this.outputCapacity) continue;
        change(b.output, output); change(this.state.stats.produced, output);
        // Sorting provides repeatable early income so hiring cannot soft-lock expansion.
        if (b.kind === 'recycling') this.state.money += 12;
        if (b.job.owner === 'player') { this.state.player.activeBuilding = undefined; this.notify(`${BUILDINGS[b.kind].name}: ürünler hazır! Alanda kalırsan otomatik toplanır.`); }
        b.job = undefined;
        this.earnXp(5);
      }
    }
    const reached = (this.state.stats.produced.organic ?? 0) > 0 && (this.state.stats.produced.compost ?? 0) > 0 && (this.state.stats.produced.meal ?? 0) > 0 && this.state.completedContracts > 0;
    if (reached && !this.state.milestones) { this.state.milestones = 1; this.state.money += 300; this.notify('İlk sofra tamamlandı! +300 yaprak. Yeni odalar açarak mobilya ve enerji zincirlerini kur.'); }
  }
}
