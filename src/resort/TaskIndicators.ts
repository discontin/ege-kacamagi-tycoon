import { BAR_CASH, BAR_WORK, POOL_CLEAN, poolDirtyRack, poolTowelRack, wantsDrink } from './PoolServices';
import { areasFor, CLEAN_TAKE, DIRTY_BASKET, DIRTY_DROP, LAUNDRY_MACHINE, LAUNDRY_TRASH, machineCapacityForLevel, POOL_GATE, RECEPTION, ROOM_DEFS, SEAT_DEFS, TOWEL_RACK } from './data';
import { carryingCapacity, towelLimit } from './Office';
import type { Point, ResortGameState, TaskKind } from './types';
import { serviceGuestReady } from './CustomerService';
import { workAreaContains } from './WorkAreas';
import { dirtyLinenCount, linenCount } from './Linen';

export type TaskIcon = 'bed' | 'bath' | 'clean' | 'towel' | 'guest' | 'dirty' | 'wash' | 'cash' | 'drink' | 'icecream' | 'net' | 'trash' | 'warning';
export interface TaskIndicator extends Point { id: string; areaId: string; icon: TaskIcon; label: string; height: number; state: 'todo' | 'working' | 'waiting'; progress?: number }
/** Presentation-only notices; no new jobs, resource transfers or save fields. */
export function taskIndicators(s: ResortGameState): TaskIndicator[] {
  const out: TaskIndicator[] = [];
  const add = (id: string, areaId: string, icon: TaskIcon, label: string, x: number, y: number, height: number, target?: string, kind?: TaskKind) => {
    const task = s.tasks.find(t => t.target === target && t.kind === kind);
    const actor = task ? task.owner === 'player' ? s.player : s.workers.find(w => w.id === task.owner) : undefined;
    const area = task ? areasFor(s).find(a => a.id === areaId) : undefined;
    const active = !!actor && !!area && actor.path.length === 0 && !s.settings.paused && workAreaContains(actor, area) && !!task && serviceGuestReady(s, task.kind, task.guest);
    out.push({ id, areaId, icon, label, x, y, height, state: task ? active ? 'working' : 'waiting' : 'todo', progress: task ? 1 - task.remaining / task.total : undefined });
  };
  for (const r of ROOM_DEFS) {
    const f = s.facilities.find(f => f.id === r.id)!;
    if (!f.open || f.guest) continue;
    if (f.dirty) add(`${r.id}Clean`, `${r.id}Work`, 'bed', `${r.name}: yatağı topla`, r.x + 3, r.y + 3, 2.3, r.id, 'cleanRoom');
    if (f.floorDirty) add(`${r.id}FloorClean`, `${r.id}Floor`, 'clean', `${r.name}: zemini süpür`, r.x + 7, r.y + 4, 1.4, r.id, 'cleanFloor');
    if (f.level >= 2 && f.bathroomDirty) add(`${r.id}BathroomClean`, `${r.id}Bathroom`, 'bath', `${r.name}: banyoyu temizle`, r.x + 6, r.y + 2, 1.8, r.id, 'cleanBathroom');
    if (!f.dirty && (f.towels === 0 || f.needsSheet)) add(`${r.id}Towel`, `${r.id}Work`, f.needsSheet ? 'bed' : 'towel', `${r.name}: temiz havlu ve çarşaf getir`, r.x + 3, r.y + 3, 2.3, r.id, 'restockRoom');
  }
  const pool = s.facilities.find(f => f.id === 'pool')!;
  const readyRoom = s.facilities.some(f => f.kind === 'room' && f.open && !f.guest && !f.dirty && !f.floorDirty && !f.bathroomDirty && !f.needsSheet && f.towels > 0);
  if (s.guests.some(g => g.phase === 'queue') && (readyRoom || s.tasks.some(t => t.kind === 'checkin'))) add('receptionGuest', 'checkin', 'guest', 'Resepsiyon: misafir karşıla', RECEPTION.x + 1.7, 43.5, 2.6, 'reception', 'checkin');
  const reception = s.facilities.find(f => f.id === 'reception')!;
  if (reception.cash > 0) add('receptionMoney', 'receptionCash', 'cash', `${reception.cash} para topla`, 23, 46, 1.5);
  if (dirtyLinenCount(s.player.bag) > 0) add('laundryDirty', 'dirtyDrop', 'dirty', 'Kirli havlu ve çarşafları sepete bırak', DIRTY_DROP.x, DIRTY_DROP.y, 1.9, 'laundry', 'dirtyDrop');
  const takingCleanLinen = s.tasks.some(t => t.owner === 'player' && t.target === 'laundry' && t.kind === 'cleanTake');
  if (s.laundry.clean === 0) add('laundryCleanEmpty', 'cleanTake', 'warning', 'Temiz havlu rafı boş', TOWEL_RACK.x, TOWEL_RACK.y, 2.7);
  else if (takingCleanLinen) add('laundryClean', 'cleanTake', 'towel', 'Temiz havlu ve çarşaf al', TOWEL_RACK.x, TOWEL_RACK.y, 2.7, 'laundry', 'cleanTake');
  if (s.laundry.remaining !== null) {
    const done = s.laundry.remaining === 0;
    add('laundryWash', done ? 'machineUnload' : 'machineLoad', 'wash', done ? 'Makineyi boşalt · temizler rafa eklenir' : 'Makine çamaşırları yıkıyor', LAUNDRY_MACHINE.x, LAUNDRY_MACHINE.y, 2.5);
    out.at(-1)!.state = s.settings.paused ? 'waiting' : done ? 'todo' : 'working';
  }
  if (s.laundry.remaining !== 0 && (s.laundry.washingTowels ?? 0) + (s.laundry.washingSheets ?? 0) < machineCapacityForLevel(s.facilities.find(f => f.id === 'laundry')!.level) && dirtyLinenCount(s.player.bag) > 0) add('laundryLoad', 'machineLoad', 'wash', 'Kirli çamaşırı makineye koy', LAUNDRY_MACHINE.x, LAUNDRY_MACHINE.y, 2.5, 'laundry', 'machineLoad');
  const bagSpace = carryingCapacity(s.player) - linenCount(s.player.bag);
  const canTakeDirtyTowel = s.laundry.dirty > 0 && s.player.bag.clean + s.player.bag.dirty < towelLimit(s.player);
  const canTakeDirtySheet = (s.laundry.dirtySheets ?? 0) > 0;
  if (bagSpace > 0 && (canTakeDirtyTowel || canTakeDirtySheet)) add('laundryPickup', 'laundryDirtyTake', 'dirty', 'Kirli raftan çamaşır al', DIRTY_BASKET.x, DIRTY_BASKET.y, 2.3, 'laundry', 'laundryDirtyTake');
  if (linenCount(s.player.bag) > 0 || s.player.drink) add('laundryTrash', 'laundryTrash', 'trash', 'Elindekini çöpe at', LAUNDRY_TRASH.x, LAUNDRY_TRASH.y, 1.8, 'laundry', 'discardItem');
  if (pool.open) {
    const dirtyRack = poolDirtyRack(pool.level), cleanRack = poolTowelRack(pool.level);
    if ((pool.dirtyTowels ?? 0) > 0) add('poolDirtyTowels', 'poolDirtyTake', 'towel', 'Kirli havluları çamaşırhaneye taşı', dirtyRack.x, dirtyRack.y, 2.3, 'poolDirty', 'poolDirtyTake');
    for (const r of SEAT_DEFS) { const seat = s.seats.find(s => s.id === r.id)!; if (seat.open && !seat.dirty && !seat.guest && !seat.towel) add(`${r.id}Restock`, `${r.id}Towel`, 'towel', 'Şezlonga temiz havlu ser', r.x, r.y - .6, 1.8, r.id, 'restockSeat'); }
    if ((pool.dirt ?? 0) > 0) add('poolMaintenance', 'poolClean', 'net', 'Havuzu kepçeyle temizle', POOL_CLEAN.x, POOL_CLEAN.y, 2, 'pool', 'cleanPool');
    if (s.bar?.open) {
      if (s.guests.some(wantsDrink) && !s.player.drink) add('barOrder', 'barPrepare', 'drink', 'Siparişi hazırla', BAR_WORK.x, BAR_WORK.y, 2.3, 'bar', 'prepareDrink');
      for (const guest of s.guests.filter(wantsDrink)) { const seat = SEAT_DEFS.find(r => r.id === guest.seat)!; add(`order:${guest.id}`, `drink:${guest.id}`, guest.orderProduct === 'icecream' ? 'icecream' : 'drink', guest.orderProduct === 'icecream' ? 'Misafire dondurma ver' : 'Misafire limonata ver', seat.x, seat.y - .6, 2.4, `drink:${guest.id}`, 'deliverDrink'); }
      if (s.bar.cash > 0) add('barMoney', 'barCash', 'cash', `${s.bar.cash} para topla`, BAR_CASH.x, BAR_CASH.y, 1.5);
    }
    for (const r of SEAT_DEFS) { const seat = s.seats.find(s => s.id === r.id)!; if (seat.open && seat.dirty && !seat.guest) add(`${r.id}Clean`, `${r.id}Area`, 'clean', 'Şezlongu temizle', r.x, r.y - .6, 1.8, r.id, 'cleanSeat'); }
    if (pool.towels < 4) add('poolTowels', 'poolStock', 'towel', 'Havuz rafına temiz havlu getir', cleanRack.x, cleanRack.y, 2.3, 'pool', 'poolStock');
    if (((pool.dirt ?? 0) < 4 && (pool.towels > 0 || s.seats.some(seat => seat.open && !seat.dirty && !seat.guest && seat.towel)) && s.guests.some(g => g.phase === 'poolQueue') && s.seats.some(s => s.open && !s.dirty && !s.guest)) || s.tasks.some(t => t.kind === 'poolCheckin')) add('poolGuest', 'poolCheckin', 'guest', 'Havuz misafirini karşıla', POOL_GATE.x, POOL_GATE.y, 2.5, 'pool', 'poolCheckin');
    if (pool.cash > 0) add('poolMoney', 'poolCash', 'cash', `${pool.cash} para topla`, 21, 5, 1.5);
  }
  return out;
}
export function taskIconSvg(icon: TaskIcon): string {
  const paths: Record<TaskIcon, string> = {
    bath: '<path d="M4 13h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-2Zm2 0V6a3 3 0 0 1 6 0v1M3 13h18M7 21v1m10-1v1"/>',
    icecream: '<path d="m8 10 4 12 4-12M9 14h6"/><circle cx="12" cy="7" r="5"/>',
    drink: '<path d="M7 7h10l-1 14H8L7 7ZM13 7l3-5h4M8 12h8"/><circle cx="5" cy="7" r="3"/>',
    net: '<path d="m3 21 8-10"/><ellipse cx="15" cy="7" rx="7" ry="5" transform="rotate(-35 15 7)"/><path d="m10 4 8 5m-9-2 7 5m-3-9-3 7m8-6-3 7"/>',
    bed: '<path d="M3 18v3m18-3v3M3 10V5h3m-3 5h18v8H3v-8Z"/><rect x="6" y="6" width="5" height="4" rx="1"/><rect x="12" y="6" width="5" height="4" rx="1"/><path d="m18 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" fill="currentColor" stroke="none"/>',
    clean: '<path d="m7 20 4-9 6 3-4 8-6-2Z" fill="currentColor" stroke="none"/><path d="m14 12 4-8M9 19l3-6m0 7 3-6M4 7v4m-2-2h4m14 7v4m-2-2h4"/>',
    towel: '<path d="M3 4h18M6 4v17h12V4"/><path d="M6 16h12M6 19h12M8 7v6m2-6v6"/><path d="M18 5v9h3V7a2 2 0 0 0-2-2h-1Z" fill="currentColor" opacity=".35"/>',
    guest: '<circle cx="8" cy="7" r="3"/><path d="M3 19v-2a5 5 0 0 1 10 0v2m3-8 3 3 3-3m-3-7v10M15 20h7"/>',
    dirty: '<path d="m4 11 2 10h12l2-10H4Zm2 0 1-5h3l2 3 3-4 3 6M9 14v4m6-4v4M8 3l2 2m8-3 1 2"/>',
    wash: '<rect x="3" y="3" width="18" height="19" rx="3"/><circle cx="12" cy="14" r="5"/><path d="M6 6h2m3 0h7M8 15c3-4 5 3 8-1"/>',
    cash: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M5 10v5m14-5v5M6 3h12"/>',
    trash: '<path d="M4 7h16M9 3h6l1 4H8l1-4Zm-3 4 1 14h10l1-14M9 11v6m6-6v6"/>',
    warning: '<path d="M12 3 2.5 21h19L12 3Z"/><path d="M12 9v5m0 3v.5"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg>`;
}
