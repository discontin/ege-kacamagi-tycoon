import { BUILDINGS, CONTRACTS, MAP_HEIGHT, MAP_WIDTH, RESOURCE_IDS } from './data';
import { count, initialState, Simulation } from './Simulation';
import type { GameState, Inventory } from './types';
import { ROOM_IDS, ROOMS, relocateLegacy, roomAt, roomForKind, wallCell } from './facility';

const SAVE_KEY = 'copten-sehre-save-v1';
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, max = 1e9) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const point = (v: unknown): boolean => object(v) && number(v.x, MAP_WIDTH - 1) && number(v.y, MAP_HEIGHT - 1);
const inventory = (v: unknown): v is Inventory => object(v) && Object.entries(v).every(([r, n]) => RESOURCE_IDS.includes(r as any) && number(n, 100000) && Number.isInteger(n));

export function parseSave(raw: string): GameState | null {
  try {
    const s = JSON.parse(raw);
    if (!object(s) || s.version !== 1 || !number(s.money) || !number(s.elapsed) || !number(s.nextId) || !number(s.completedContracts) || !number(s.milestones) || !number(s.homeNeedTimer)) return null;
    if (!point(s.player) || !object(s.player) || !inventory(s.player.bag) || count(s.player.bag) > 12 || !inventory(s.inventory)) return null;
    if (!Array.isArray(s.buildings) || s.buildings.length < 1 || s.buildings.length > 300 || !Array.isArray(s.workers) || s.workers.length > 5) return null;
    const ids = new Set<string>();
    for (const b of s.buildings) {
      if (!point(b) || !object(b) || typeof b.id !== 'string' || ids.has(b.id) || !Object.hasOwn(BUILDINGS, b.kind) || !number(b.level, 3) || b.level < 1 || !Number.isInteger(b.level) || typeof b.rotated !== 'boolean' || !inventory(b.output) || count(b.output) > 16) return null;
      const def = BUILDINGS[b.kind as keyof typeof BUILDINGS];
      if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x + (b.rotated ? def.height : def.width) >= MAP_WIDTH || b.y + (b.rotated ? def.width : def.height) >= MAP_HEIGHT) return null;
      if (b.job && (!object(b.job) || typeof b.job.owner !== 'string' || !number(b.job.remaining, 100) || !number(b.job.total, 100) || b.job.total === 0 || b.job.remaining > b.job.total || !def.recipe)) return null;
      ids.add(b.id);
    }
    if (!s.buildings.some((b: any) => b.kind === 'warehouse') || !s.buildings.some((b: any) => b.kind === 'shop')) return null;
    const workers = new Set<string>();
    for (const w of s.workers) {
      if (!point(w) || !object(w) || typeof w.id !== 'string' || ids.has(w.id) || workers.has(w.id) || typeof w.name !== 'string' || w.name.length > 30 || !number(w.level, 3) || w.level < 1 || !Number.isInteger(w.level) || !inventory(w.carrying) || count(w.carrying) > 6) return null;
      if (w.assignedBuilding && (!ids.has(w.assignedBuilding) || s.workers.some((other: any) => other.id !== w.id && other.assignedBuilding === w.assignedBuilding))) return null;
      w.path = []; w.phase = 'idle'; workers.add(w.id);
    }
    if (!object(s.contract) || !CONTRACTS.some(c => c.id === s.contract.definitionId) || !number(s.contract.remaining, 1000)) return null;
    if (!object(s.boost) || s.boost.multiplier !== 1.5 || !number(s.boost.remaining, 120)) return null;
    if (!object(s.stats) || !inventory(s.stats.produced) || !inventory(s.stats.delivered) || !number(s.stats.collected)) return null;
    if (!object(s.settings) || ![1, 2].includes(s.settings.speed)) return null;
    if (s.layout === undefined) {
      relocateLegacy(s.buildings);
      s.layout = 'facility-v1'; s.rooms = [...ROOM_IDS];
      s.xp = Math.max(140, Object.values(s.stats.produced).reduce((sum: number, n) => sum + Number(n), 0));
      s.player.x = 16; s.player.y = 36; s.player.activeBuilding = undefined;
      s.workers.forEach((w: any) => { w.x = 16; w.y = 36; });
    }
    if (s.layout !== 'facility-v1' || !number(s.xp) || !Array.isArray(s.rooms) || !s.rooms.includes('recycling') || new Set(s.rooms).size !== s.rooms.length || s.rooms.some((id: unknown) => !ROOM_IDS.includes(id as string))) return null;
    if (ROOMS.some(r => s.rooms.includes(r.id) && r.requires && !s.rooms.includes(r.requires))) return null;
    const sim = new Simulation(s as GameState);
    const occupied = new Set<string>();
    for (const b of sim.state.buildings) {
      const size = sim.footprint(b);
      const room = roomForKind(b.kind);
      if (room && (!sim.roomOpen(room.id) || roomAt(b.x, b.y)?.id !== room.id || roomAt(b.x + size.width - 1, b.y + size.height)?.id !== room.id)) return null;
      if (!room && (b.y < 33 || b.y + size.height > 36 || b.x < 2 || b.x + size.width > 32)) return null;
      if (room) for (let x = b.x; x < b.x + size.width; x++) for (let y = b.y; y < b.y + size.height; y++) if (wallCell(room, x, y)) return null;
      for (let x = b.x; x < b.x + size.width; x++) for (let y = b.y; y < b.y + size.height; y++) { const key = `${x},${y}`; if (occupied.has(key)) return null; occupied.add(key); }
      if (!sim.isWalkable(sim.entrance(b).x, sim.entrance(b).y)) return null;
      if (b.job && b.job.owner !== 'player' && !workers.has(b.job.owner)) return null;
      if (b.job && b.job.owner !== 'player' && !sim.state.workers.some(w => w.id === b.job!.owner && w.assignedBuilding === b.id)) return null;
    }
    if (count(s.inventory) > sim.capacity) return null;
    if (!sim.isWalkable(Math.round(s.player.x), Math.round(s.player.y))) return null;
    if (s.workers.some((w: any) => !sim.isWalkable(Math.round(w.x), Math.round(w.y)))) return null;
    s.player.path = []; s.settings.paused = false;
    s.nextId = Math.max(s.nextId, ...[...ids, ...workers].map(id => Number(id.slice(1)) + 1).filter(Number.isFinite));
    if (s.player.activeBuilding && (!ids.has(s.player.activeBuilding) || sim.building(s.player.activeBuilding)?.job?.owner !== 'player')) s.player.activeBuilding = undefined;
    return s as GameState;
  } catch { return null; }
}

export class SaveService {
  lastSaved = '';
  migrated = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage, readonly temporary = false) {}
  load(): { state: GameState; recovered: boolean; existing: boolean } {
    if (this.temporary) return { state: initialState(), recovered: false, existing: false };
    try {
      const raw = this.storage.getItem(SAVE_KEY); if (!raw) return { state: initialState(), recovered: false, existing: false };
      const legacy = JSON.parse(raw).layout === undefined;
      if (legacy) { try { this.storage.setItem('copten-sehre-yard-backup-v1', raw); } catch {} }
      const state = parseSave(raw); this.migrated = legacy && !!state;
      return { state: state ?? initialState(), recovered: !state, existing: !!state };
    }
    catch { return { state: initialState(), recovered: true, existing: false }; }
  }
  save(state: GameState): boolean {
    if (this.temporary) { this.lastSaved = 'Test modu · kayıt yapılmaz'; return true; }
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(state)); this.lastSaved = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); return true; } catch { return false; }
  }
}
