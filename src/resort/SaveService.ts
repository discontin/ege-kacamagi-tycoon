import { initialResort, machineCapacityForLevel, ROOM_DEFS, SEAT_DEFS } from './data';
import type { ResortGameState } from './types';
import { linenCount } from './Linen';
export const RESORT_SAVE_KEY = 'ege-kacamagi-save-v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const roles = ['reception', 'rooms', 'pool', 'hauling', 'bartender'];
const phases = ['queue', 'toRoom', 'staying', 'toPool', 'poolQueue', 'toSeat', 'swimming', 'leaving'];
const kinds = ['checkin', 'cleanRoom', 'cleanFloor', 'cleanBathroom', 'restockRoom', 'dirtyDrop', 'cleanTake', 'poolCheckin', 'cleanSeat', 'poolStock', 'cleanPool', 'prepareDrink', 'deliverDrink', 'poolDirtyDrop', 'poolDirtyTake', 'poolCleanTake', 'restockSeat', 'laundryDirtyTake', 'machineLoad', 'machineUnload', 'laundryCleanDrop', 'discardItem', 'watchBoost', 'watchMoney'];
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const point = (v: any) => v && num(v.x) && typeof v.y === 'number' && Number.isFinite(v.y) && v.y >= -3 && v.x <= 43 && v.y <= 51;
const actor = (v: any) => point(v) && typeof v.id === 'string' && Array.isArray(v.path) && v.path.every(point) && ((v.drink === undefined || typeof v.drink === 'boolean') && (v.heldProduct === undefined || v.heldProduct === 'lemonade')) && (v.carryingWashed === undefined || typeof v.carryingWashed === 'boolean');
const optionalCount = (v: unknown) => v === undefined || num(v) && Number.isInteger(v);
const bag = (v: any) => v && num(v.clean) && num(v.dirty) && Number.isInteger(v.clean) && Number.isInteger(v.dirty) && optionalCount(v.cleanSheets) && optionalCount(v.dirtySheets);
const level = (v: any) => Number.isInteger(v) && v >= 1 && v <= 3;
export function validResort(v: any): v is ResortGameState {
  if (!v || v.version !== 1 || v.concept !== 'ege-resort' || !['money', 'xp', 'elapsed', 'spawnTimer', 'nextId'].every(k => num(v[k]))) return false;
  if (v.bar !== undefined && (!v.bar || typeof v.bar.open !== 'boolean' || !num(v.bar.cash) || !Number.isInteger(v.bar.cash))) return false;
  if (!actor(v.player) || v.player.id !== 'player' || !bag(v.player.bag) || linenCount(v.player.bag) > 8) return false;
  if (!v.settings || typeof v.settings.paused !== 'boolean' || (v.settings.volume !== undefined && (!num(v.settings.volume) || v.settings.volume > 1)) || ![1, 2].includes(v.settings.speed) || !v.boost || !num(v.boost.remaining) || v.boost.remaining > 120 || v.boost.multiplier !== 1.5) return false;
  if (!v.stats || !['welcomed', 'stays', 'cleaned', 'washed', 'poolVisits', 'earned'].every(k => num(v.stats[k]))) return false;
  const expected = new Map(initialResort().facilities.map(f => [f.id, f.kind]));
  if (!Array.isArray(v.facilities) || v.facilities.length !== 9 || new Set(v.facilities.map((f: any) => f.id)).size !== 9 || !v.facilities.every((f: any) => expected.get(f.id) === f.kind && level(f.level) && (f.kind === 'room' || f.kind === 'pool' ? f.level <= 2 : true) && typeof f.open === 'boolean' && typeof f.dirty === 'boolean' && (f.bathroomDirty === undefined || typeof f.bathroomDirty === 'boolean') && (f.floorDirty === undefined || typeof f.floorDirty === 'boolean') && (f.needsSheet === undefined || typeof f.needsSheet === 'boolean') && num(f.towels) && num(f.cash) && optionalCount(f.tips) && optionalCount(f.dirt) && optionalCount(f.dirtyTowels) && (f.dirtyTowels === undefined || f.kind === 'pool' && f.dirtyTowels <= 48) && (f.dirt === undefined || f.kind === 'pool' && f.dirt <= 4))) return false;
  if (!Array.isArray(v.seats) || v.seats.length !== SEAT_DEFS.length || new Set(v.seats.map((s: any) => s.id)).size !== SEAT_DEFS.length || !v.seats.every((s: any) => SEAT_DEFS.some(d => d.id === s.id) && typeof s.open === 'boolean' && typeof s.dirty === 'boolean' && (s.towel === undefined || typeof s.towel === 'boolean'))) return false;
  if (!Array.isArray(v.guests) || v.guests.length > 12 || !v.guests.every((g: any) => actor(g) && phases.includes(g.phase) && num(g.remaining) && (g.orderProduct === undefined || g.orderProduct === 'lemonade') && (g.visitsPool === undefined || typeof g.visitsPool === 'boolean') && (g.wantsLemonade === undefined || typeof g.wantsLemonade === 'boolean') && (g.poolActivity === undefined || ['swim', 'relax'].includes(g.poolActivity)) && (g.drinkRequested === undefined || typeof g.drinkRequested === 'boolean') && (g.drinkServed === undefined || typeof g.drinkServed === 'boolean') && (g.queueWait === undefined || num(g.queueWait)) && (g.worstWait === undefined || num(g.worstWait)) && (!g.room || ROOM_DEFS.some(r => r.id === g.room)) && (!g.seat || SEAT_DEFS.some(s => s.id === g.seat)))) return false;
  if (v.guests.some((g: any) => ['toRoom', 'staying'].includes(g.phase) && (!g.room || !v.facilities.some((f: any) => f.id === g.room && f.open && f.guest === g.id)) || ['toSeat', 'swimming'].includes(g.phase) && (!g.seat || !v.seats.some((s: any) => s.id === g.seat && s.open && s.guest === g.id)))) return false;
  if (!Array.isArray(v.workers) || v.workers.length > 5 || !v.workers.every((w: any) => actor(w) && typeof w.name === 'string' && typeof w.status === 'string' && roles.includes(w.role) && level(w.level) && (w.moveLevel === undefined || level(w.moveLevel)) && (w.carryLevel === undefined || level(w.carryLevel)) && bag(w.bag) && linenCount(w.bag) <= 8 + 4 * ((w.carryLevel ?? 1) - 1))) return false;
  if (!v.laundry || !optionalCount(v.laundry.cleanSheets) || !optionalCount(v.laundry.dirtySheets) || ![undefined, 'sheet', 'towel'].includes(v.laundry.washingKind) || v.laundry.washingKind && v.laundry.remaining === null || !num(v.laundry.clean) || !num(v.laundry.dirty) || !(v.laundry.remaining === null || num(v.laundry.remaining))) return false;
  if (!optionalCount(v.laundry.washingTowels) || !optionalCount(v.laundry.washingSheets) || (v.laundry.washingTowels ?? 0) + (v.laundry.washingSheets ?? 0) > machineCapacityForLevel(v.facilities.find((f: any) => f.id === 'laundry').level) || v.laundry.remaining === null && ((v.laundry.washingTowels ?? 0) + (v.laundry.washingSheets ?? 0) > 0)) return false;
  const cap = [24, 36, 48][v.facilities.find((f: any) => f.id === 'laundry').level - 1];
  if (v.laundry.clean > cap || v.laundry.dirty + (v.laundry.dirtySheets ?? 0) > cap || (v.laundry.cleanSheets ?? 0) > cap || v.facilities.some((f: any) => f.kind === 'room' && f.towels > 1 || f.kind === 'pool' && f.towels > cap)) return false;
  const actors = [v.player, ...v.workers], ids = new Set(actors.map((a: any) => a.id)), guests = new Set(v.guests.map((g: any) => g.id));
  if (new Set([...actors, ...v.guests].map((a: any) => a.id)).size !== actors.length + v.guests.length) return false;
  if (!Array.isArray(v.tasks) || new Set(v.tasks.map((t: any) => t.id)).size !== v.tasks.length || !v.tasks.every((t: any) => typeof t.id === 'string' && ids.has(t.owner) && kinds.includes(t.kind) && num(t.remaining) && num(t.total) && t.total > 0 && t.remaining <= t.total && (expected.has(t.target) || t.target === 'bar' || ['rewardedBoost', 'rewardedMoney'].includes(t.target) || ['poolDirtyDrop', 'poolDirtyTake'].includes(t.kind) && t.target === 'poolDirty' || t.kind === 'poolCleanTake' && t.target === 'poolClean' || t.kind === 'deliverDrink' && t.target === `drink:${t.guest}` || SEAT_DEFS.some(s => s.id === t.target)) && (!t.guest || guests.has(t.guest)) && (!t.destination || ROOM_DEFS.some(r => r.id === t.destination) || SEAT_DEFS.some(s => s.id === t.destination)))) return false;
  if (actors.some((a: any) => a.task && !v.tasks.some((t: any) => t.id === a.task && t.owner === a.id)) || v.tasks.some((t: any) => actors.find((a: any) => a.id === t.owner)?.task !== t.id)) return false;
  if (v.tasks.some((t: any) => t.kind === 'checkin' && (t.target !== 'reception' || !t.guest || !ROOM_DEFS.some(r => r.id === t.destination)) || t.kind === 'poolCheckin' && (t.target !== 'pool' || !t.guest || !SEAT_DEFS.some(s => s.id === t.destination)) || ['cleanRoom', 'cleanFloor', 'cleanBathroom', 'restockRoom'].includes(t.kind) && !ROOM_DEFS.some(r => r.id === t.target) || t.kind === 'cleanSeat' && !SEAT_DEFS.some(s => s.id === t.target) || ['cleanTake', 'dirtyDrop'].includes(t.kind) && t.target !== 'laundry' || t.kind === 'poolStock' && t.target !== 'pool')) return false;
  if (v.facilities.some((f: any) => f.guest && !guests.has(f.guest)) || v.seats.some((s: any) => s.guest && !guests.has(s.guest))) return false;
  if (v.tasks.some((t: any) => t.kind === 'cleanPool' && (t.target !== 'pool' || !v.facilities.find((f: any) => f.id === 'pool').open) || t.kind === 'prepareDrink' && (t.target !== 'bar' || !v.bar?.open || !t.guest) || t.kind === 'deliverDrink' && (!v.bar?.open || t.target !== `drink:${t.guest}` || !v.guests.some((g: any) => g.id === t.guest && g.phase === 'swimming' && g.drinkRequested && !g.drinkServed)))) return false;
  const drinkGuests = v.tasks.filter((t: any) => t.kind === 'prepareDrink' || t.kind === 'deliverDrink').map((t: any) => t.guest);
  if (new Set(drinkGuests).size !== drinkGuests.length) return false;
  const locks = v.tasks.map((t: any) => `${t.target}:${t.target === 'laundry' ? t.kind : ''}`);
  return new Set(locks).size === locks.length;
}
export class ResortSaveService {
  lastSaved = '';
  constructor(private storage: Store = localStorage, readonly temporary = false) {}
  load() {
    if (this.temporary) return { state: initialResort(true), recovered: false, existing: false };
    try { const raw = this.storage.getItem(RESORT_SAVE_KEY); if (!raw) return { state: initialResort(), recovered: false, existing: false }; const v: any = JSON.parse(raw); if (Array.isArray(v?.seats) && v.seats.length === 4) for (const d of SEAT_DEFS.slice(4)) v.seats.push({ id: d.id, open: false, dirty: false, towel: false }); if (Array.isArray(v?.facilities)) for (const f of v.facilities) if ((f?.kind === 'room' || f?.kind === 'pool') && f.level === 3) f.level = 2; for (const a of [v?.player, ...(Array.isArray(v?.workers) ? v.workers : []), ...(Array.isArray(v?.guests) ? v.guests : [])]) if (a?.heldProduct === 'icecream') a.heldProduct = 'lemonade'; if (Array.isArray(v?.guests)) for (const g of v.guests) if (g?.orderProduct === 'icecream') g.orderProduct = 'lemonade'; if (!validResort(v)) throw new Error('Invalid save'); return { state: v, recovered: false, existing: true }; }
    catch { return { state: initialResort(), recovered: true, existing: false }; }
  }
  save(state: ResortGameState) {
    if (this.temporary) { this.lastSaved = 'Test modu · kayıt yok'; return true; }
    try { this.storage.setItem(RESORT_SAVE_KEY, JSON.stringify(state)); this.lastSaved = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); return true; } catch { return false; }
  }
}
