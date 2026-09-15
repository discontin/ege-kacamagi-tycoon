import type { BuildingKind, BuildingState, Point } from './types';

export interface RoomDefinition {
  id: string; name: string; icon: string; x: number; y: number; width: number; height: number;
  color: number; floor: number; level: number; cost: number; requires?: string; door: Point; gate: Point;
  stations: [BuildingKind, number, number][];
}
export const LEVEL_XP = [0, 15, 40, 80, 140, 220];
export const facilityLevel = (xp: number) => LEVEL_XP.filter(n => xp >= n).length;
export const ROOMS: RoomDefinition[] = [
  { id: 'recycling', name: 'Geri dönüşüm odası', icon: '♻', x: 1, y: 23, width: 13, height: 10, color: 0x6fbfa3, floor: 0xe6d2a6, level: 1, cost: 0, door: { x: 13, y: 28 }, gate: { x: 14, y: 28 }, stations: [['collection', 3, 26], ['recycling', 8, 26]] },
  { id: 'garden', name: 'Sera ve kompost', icon: '🌱', x: 1, y: 13, width: 13, height: 10, color: 0x99c575, floor: 0xccb98b, level: 2, cost: 100, requires: 'recycling', door: { x: 13, y: 18 }, gate: { x: 14, y: 18 }, stations: [['composter', 3, 16], ['farm', 8, 16]] },
  { id: 'kitchen', name: 'Mutfak odası', icon: '🥗', x: 20, y: 23, width: 13, height: 10, color: 0xf3ae7b, floor: 0xf4e3ba, level: 3, cost: 160, requires: 'garden', door: { x: 20, y: 28 }, gate: { x: 19, y: 28 }, stations: [['kitchen', 24, 26]] },
  { id: 'workshop', name: 'Mobilya atölyesi', icon: '🪑', x: 20, y: 13, width: 13, height: 10, color: 0xd8a17a, floor: 0xd0a278, level: 4, cost: 240, requires: 'kitchen', door: { x: 20, y: 18 }, gate: { x: 19, y: 18 }, stations: [['workshop', 24, 16]] },
  { id: 'energy', name: 'Enerji odası', icon: '⚡', x: 20, y: 1, width: 13, height: 12, color: 0x8dc7d5, floor: 0xbfd6d3, level: 5, cost: 300, requires: 'workshop', door: { x: 20, y: 7 }, gate: { x: 19, y: 7 }, stations: [['biogas', 23, 5], ['generator', 28, 5]] },
  { id: 'community', name: 'Mahalle salonu', icon: '🏡', x: 1, y: 1, width: 13, height: 12, color: 0xc1a7da, floor: 0xe4cbb5, level: 3, cost: 180, requires: 'kitchen', door: { x: 13, y: 7 }, gate: { x: 14, y: 7 }, stations: [['home', 3, 5], ['home', 8, 5]] }
];
export const ROOM_IDS = ROOMS.map(r => r.id);
export const roomAt = (x: number, y: number) => ROOMS.find(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
export const roomForKind = (kind: BuildingKind) => ROOMS.find(r => r.stations.some(([k]) => k === kind));
export function wallCell(room: RoomDefinition, x: number, y: number) {
  return (x === room.x || x === room.x + room.width - 1 || y === room.y || y === room.y + room.height - 1) && !(x === room.door.x && y === room.door.y);
}
export function roomBuildings(room: RoomDefinition, nextId: () => string): BuildingState[] {
  return room.stations.map(([kind, x, y]) => ({ id: nextId(), kind, x, y, rotated: false, level: 1, output: {} }));
}

/** Re-layout an old yard without deleting purchased stations, stock or workers. */
export function relocateLegacy(buildings: BuildingState[]) {
  const used = new Set<string>();
  for (const b of buildings) {
    const room = roomForKind(b.kind), base = room?.stations.find(([kind]) => kind === b.kind);
    const origin = base ? { x: base[1], y: base[2] } : { x: b.kind === 'warehouse' ? 9 : 15, y: 33 };
    // Scan interior slots; wide enough spacing reserves fronts for work points.
    const candidates = room ? [origin, ...[room.y + 2, room.y + 5, room.y + 7].flatMap(y => [room.x + 2, room.x + 7].map(x => ({ x, y })))] : [origin, ...[33].flatMap(y => [2, 6, 21, 26, 30].map(x => ({ x, y })))];
    const width = b.kind === 'warehouse' || b.kind === 'farm' ? 3 : 2;
    const slot = candidates.find(p => {
      if (room && (p.x + width >= room.x + room.width - 1 || p.y + 2 >= room.y + room.height - 1)) return false;
      for (let x = p.x; x < p.x + width; x++) for (let y = p.y; y <= p.y + 2; y++) if (used.has(`${x},${y}`)) return false;
      return true;
    });
    if (!slot) throw new Error('Legacy facility capacity exceeded');
    b.x = slot.x; b.y = slot.y; b.rotated = false;
    for (let x = b.x; x < b.x + width; x++) for (let y = b.y; y <= b.y + 2; y++) used.add(`${x},${y}`);
  }
}
