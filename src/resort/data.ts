import { BAR_CASH, BAR_WORK, POOL_CLEAN, poolDirtyBasket, poolTowelRack, wantsDrink } from './PoolServices';
import { STAFF_AREAS, staffRoleLimit } from './StaffHiring';
import { OFFICE } from './Office';
import type { Area, Point, ResortGameState } from './types';
export const WIDTH = 46, HEIGHT = 52, MAP_MIN_X = 0, MAP_MAX_X = 40;
// Each step costs 15 XP more than the previous one. A complete early room
// cycle awards 15 XP (check-in + cleaning), while extra rooms increase the
// customer rate naturally without making late levels instant.
export const LEVELS = [0, 15, 45, 90, 150, 225, 315, 420, 540, 675];
export const POOL_UNLOCK_LEVEL = 7;
// Keep a little breathing room on both sides of the resort while making the
// central promenade wide enough for the reception traffic.
export const ROOM_DEFS = Array.from({ length: 6 }, (_, i) => ({ id: `room${i + 1}`, name: `Bungalov ${String(i + 1).padStart(2, '0')}`, x: i % 2 ? 24 : 2, y: 34 - Math.floor(i / 2) * 10, width: 10, height: 8, unlockLevel: i + 1, cost: [0, 100, 180, 260, 380, 520][i], color: [0x68baa6, 0xf4bd81, 0x87bad0, 0xeaa19c, 0x9bbc82, 0xc0a1d4][i] }));
export const ROOM_DOOR = (r: typeof ROOM_DEFS[number]): Point => ({ x: r.x < 15 ? r.x + 9 : r.x, y: r.y + 5 });
export const ROOM_APPROACH = (r: typeof ROOM_DEFS[number]): Point => ({ x: r.x < 15 ? r.x + 10 : r.x - 1, y: r.y + 5 });
export const ROOM_WORK = (r: typeof ROOM_DEFS[number]): Point => ({ x: r.x + 5, y: r.y + 5 });
export const LAUNDRY_ORIGIN = { x: 7, y: 45 };
export const LAUNDRY_RIGHT_EDGE = 11.5;
export const LAUNDRY_FRONT_EDGE = 51;
// Keep the washer close to the left wall and face it toward the side entrance.
// The shelves stay along the rear wall with a clear gap between them.
export const LAUNDRY_MACHINE = { x: 2.8, y: 46.4 };
export const LAUNDRY_MACHINE_AREA = { x: 4, y: 46.4 };
export const TOWEL_RACK = { x: 9.5, y: 42.7 }, DIRTY_BASKET = { x: 5, y: 42.7 };
// Dirty linen is dropped into a dedicated hamper in the left-front corner;
// the rear dirty shelf is pickup-only. The waste bin sits in the opposite corner.
export const DIRTY_HAMPER = { x: 3, y: 49.3 }, LAUNDRY_TRASH_PROP = { x: 10.3, y: 49.3 };
export const LAUNDRY_TRASH = { x: 8.8, y: 49.3 };
export const RECEPTION = { x: 19, y: 42 }, DIRTY_DROP = { x: 4.3, y: 49.3 }, DIRTY_TAKE = { x: 6.3, y: 43.4 }, CLEAN_TAKE = { x: 10, y: 44 }, POOL_GATE = { x: 19.5, y: 6 }, POOL_STOCK = { x: 34, y: 1.5 }, EXIT = { x: 19, y: 50 };
export const receptionQueuePoint = (index: number): Point => ({ x: RECEPTION.x, y: 46 + index });
export const SEAT_DEFS = [24, 27, 30, 33].map((x, i) => ({ id: `seat${i + 1}`, x, y: 10 })).concat([{ id: 'seat5', x: 25.5, y: 13 }, { id: 'seat6', x: 31.5, y: 13 }]);
export const poolSeatCount = (level: number) => level < 2 ? 4 : 6;
export const machineCapacityForLevel = (level: number) => 5 + 2 * (level - 1);
export const taskDuration = (level: number) => [1, .8, .65][level - 1];
export const incomeFactor = (level: number) => [1, 1.25, 1.5][level - 1];
export const upgradeCost = (id: string, level: number) => (id === 'reception' ? 100 : id === 'laundry' ? 120 : id === 'pool' ? 180 : 80) * level;
export function initialResort(test = false): ResortGameState {
  return { version: 1, concept: 'ege-resort', money: test ? 999999 : 0, xp: test ? 280 : 0, elapsed: 0, spawnTimer: 0, nextId: 10,
    player: { id: 'player', x: 19, y: 48, path: [], bag: { clean: 0, dirty: 0 } }, guests: [], workers: [], tasks: [], bar: { open: test, cash: 0 },
    facilities: [{ id: 'reception', kind: 'reception', open: true, level: 1, dirty: false, towels: 0, cash: 0 }, { id: 'laundry', kind: 'laundry', open: true, level: 1, dirty: false, towels: 0, cash: 0 }, ...ROOM_DEFS.map((r, i) => ({ id: r.id, kind: 'room' as const, open: test || !i, level: 1, dirty: false, towels: 1, cash: 0 })), { id: 'pool', kind: 'pool', open: test, level: 1, dirty: false, towels: test ? 999 : 0, cash: 0 }],
    seats: SEAT_DEFS.map((r, i) => ({ id: r.id, open: test && i < 4, dirty: false, towel: test && i < 4 })), laundry: { clean: test ? 999 : 8, dirty: 0, remaining: null }, boost: { remaining: 0, multiplier: 1.5 }, settings: { paused: false, speed: 1 }, stats: { welcomed: 0, stays: 0, cleaned: 0, washed: 0, poolVisits: 0, earned: 0 } };
}
export function areasFor(s: ResortGameState): Area[] {
  const areas: Area[] = [
    { id: 'office', label: 'Ofis · çalışan geliştirme', mode: 'work', target: 'office', ...OFFICE },
    // Use a dedicated right-front square for dirty pickup, well clear of the
    // deposit square and reachable around the washer row at every level.
    { id: 'laundryDirtyTake', label: 'Kirli raftan çamaşır al', mode: 'work', target: 'laundry', taskKind: 'laundryDirtyTake', ...DIRTY_TAKE },
    { id: 'machineLoad', label: 'Makineye kirli çamaşır koy', mode: 'work', target: 'laundry', taskKind: 'machineLoad', ...LAUNDRY_MACHINE_AREA },
    { id: 'machineUnload', label: 'Makineyi boşalt · temizler rafa eklenir', mode: 'work', target: 'laundry', taskKind: 'machineUnload', ...LAUNDRY_MACHINE_AREA },
    { id: 'laundryTrash', label: 'Elindekini çöpe at', mode: 'work', target: 'laundry', taskKind: 'discardItem', ...LAUNDRY_TRASH },
    { id: 'checkin', label: 'Müşteri karşıla', mode: 'work', target: 'reception', taskKind: 'checkin', ...RECEPTION },
    { id: 'receptionCash', label: 'Konaklama geliri', mode: 'cash', target: 'reception', x: 23, y: 46 },
    { id: 'receptionUpgrade', label: 'Resepsiyon', mode: 'upgrade', target: 'reception', x: 16, y: 46 },
    { id: 'dirtyDrop', label: 'Kirli çamaşırı sepete bırak', mode: 'work', target: 'laundry', taskKind: 'dirtyDrop', ...DIRTY_DROP },
    { id: 'cleanTake', label: 'Temiz havlu al', mode: 'work', target: 'laundry', taskKind: 'cleanTake', ...CLEAN_TAKE },
  ];
  const openRoomCount = s.facilities.filter(f => f.kind === 'room' && f.open).length;
  const poolOpen = s.facilities.find(f => f.kind === 'pool')!.open;
  for (const a of STAFF_AREAS) {
    if (a.role === 'pool' && !poolOpen) continue;
    const hired = s.workers.filter(w => w.role === a.role).length;
    if (s.workers.length >= 5 || hired >= staffRoleLimit(a.role)) continue;
    if (a.role === 'rooms') {
      if (hired === 0) areas.push({ ...a, mode: 'buy' });
      else if (hired === 1 && openRoomCount >= 4) {
        // Offer the second cleaner beside the left bungalow in the second row.
        areas.push({ ...a, id: 'roomsHire2', label: 'İkinci oda temizlikçisi', x: 12.25, y: ROOM_DEFS[2].y + 3, mode: 'buy' });
      }
    } else areas.push({ ...a, mode: 'buy' });
  }
  for (const r of ROOM_DEFS) {
    const f = s.facilities.find(f => f.id === r.id)!;
    if (!f.open) areas.push({ id: `${r.id}Buy`, label: r.name, mode: 'buy', target: r.id, ...ROOM_APPROACH(r) });
    else {
      areas.push({ id: `${r.id}Work`, label: 'Yatak yanında temizle / havlu bırak', mode: 'work', target: r.id, taskKind: f.dirty ? 'cleanRoom' : 'restockRoom', facilityLevel: f.level, ...ROOM_WORK(r) });
      if (f.floorDirty) areas.push({ id: `${r.id}Floor`, label: 'Zemini süpür', mode: 'work', target: r.id, taskKind: 'cleanFloor', x: r.x + 7, y: r.y + 4 });
      if (f.level >= 2 && f.bathroomDirty) areas.push({ id: `${r.id}Bathroom`, label: 'Banyoyu temizle', mode: 'work', target: r.id, taskKind: 'cleanBathroom', x: r.x + 6, y: r.y + 2 });
      if (f.level < 2) areas.push({ id: `${r.id}Upgrade`, label: r.name, mode: 'upgrade', target: r.id, x: ROOM_APPROACH(r).x, y: r.y + 7 });
    }
  }
  const pool = s.facilities.find(f => f.id === 'pool')!;
  if (!pool.open) areas.push({ id: 'poolBuy', label: 'Havuzu aç', mode: 'buy', target: 'pool', ...POOL_GATE });
  else {
    const cleanRack = poolTowelRack(pool.level), dirtyBasket = poolDirtyBasket(pool.level);
    const cleanWork = { x: cleanRack.x, y: cleanRack.y + 1.5 }, dirtyWork = { x: dirtyBasket.x, y: dirtyBasket.y + 1.5 };
    areas.push({ id: 'poolDirtyDrop', label: 'Kirli havluyu havuz sepetine bırak', mode: 'work', target: 'poolDirty', taskKind: 'poolDirtyDrop', facilityLevel: pool.level, ...dirtyWork }, { id: 'poolDirtyTake', label: 'Havuzun kirli havlularını al', mode: 'work', target: 'poolDirty', taskKind: 'poolDirtyTake', facilityLevel: pool.level, ...dirtyWork }, { id: 'poolCleanTake', label: 'Havuz rafından havlu al', mode: 'work', target: 'poolClean', taskKind: 'poolCleanTake', ...cleanWork });
    areas.push({ id: 'poolCheckin', label: 'Havuz girişi', mode: 'work', target: 'pool', taskKind: 'poolCheckin', ...POOL_GATE }, { id: 'poolStock', label: 'Havuza havlu bırak', mode: 'work', target: 'pool', taskKind: 'poolStock', ...cleanWork }, { id: 'poolCash', label: 'Havuz geliri', mode: 'cash', target: 'pool', x: 18, y: 5 });
    if (!s.bar?.open) areas.push({ id: 'barBuy', label: 'Havuz barı', mode: 'buy', target: 'bar', ...BAR_WORK });
    else {
      areas.push({ id: 'barPrepare', label: 'Limonata hazırla', mode: 'work', target: 'bar', taskKind: 'prepareDrink', ...BAR_WORK }, { id: 'barCash', label: 'Bar geliri', mode: 'cash', target: 'bar', ...BAR_CASH });
      for (const guest of s.guests.filter(wantsDrink)) {
        const seat = SEAT_DEFS.find(r => r.id === guest.seat)!;
        areas.unshift({ id: `drink:${guest.id}`, label: 'Limonata ver', mode: 'work', target: `drink:${guest.id}`, taskKind: 'deliverDrink', x: seat.x, y: seat.y });
      }
    }
    if ((pool.dirt ?? 0) > 0) areas.unshift({ id: 'poolClean', label: 'Havuzu kepçeyle temizle', mode: 'work', target: 'pool', taskKind: 'cleanPool', facilityLevel: pool.level, ...POOL_CLEAN });
    if (pool.level < 3) areas.push({ id: 'poolUpgrade', label: 'Havuz', mode: 'upgrade', target: 'pool', x: 22, y: 13 });
    for (const r of SEAT_DEFS) {
      const seat = s.seats.find(s => s.id === r.id)!;
      if (seat.open) areas.push({ id: `${r.id}Area`, label: 'Şezlongu temizle', mode: 'work', target: r.id, taskKind: 'cleanSeat', x: r.x, y: r.y });
      if (seat.open && !seat.dirty && !seat.guest && !seat.towel) areas.push({ id: `${r.id}Towel`, label: 'Şezlonga havlu ser', mode: 'work', target: r.id, taskKind: 'restockSeat', x: r.x, y: r.y });
    }
  }
  return areas.filter(a => a.mode !== 'upgrade' || s.facilities.find(f => f.id === a.target)!.level < 3);
}
