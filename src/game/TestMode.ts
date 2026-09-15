import { RESOURCE_IDS } from './data';
import { ROOMS, roomBuildings } from './facility';
import { initialState } from './Simulation';

export const TEST_STOCK = 999999;
export function createTestState() {
  const state = initialState(); state.rooms = ROOMS.map(r => r.id); state.xp = 220; state.money = TEST_STOCK;
  for (const room of ROOMS.slice(1)) state.buildings.push(...roomBuildings(room, () => `b${state.nextId++}`));
  state.inventory = Object.fromEntries(RESOURCE_IDS.map(r => [r, TEST_STOCK]));
  state.buildings.filter(b => b.kind === 'collection').forEach(b => b.output.waste = TEST_STOCK);
  state.boost.remaining = 120;
  return state;
}
