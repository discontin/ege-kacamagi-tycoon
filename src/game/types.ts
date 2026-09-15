export type Resource = 'waste' | 'organic' | 'fiber' | 'metal' | 'compost' | 'vegetable' | 'meal' | 'furniture' | 'biogas' | 'electricity';
export type Inventory = Partial<Record<Resource, number>>;
export type BuildingKind = 'collection' | 'recycling' | 'composter' | 'farm' | 'kitchen' | 'workshop' | 'biogas' | 'generator' | 'warehouse' | 'home' | 'shop';
export interface Point { x: number; y: number }
export interface RecipeDefinition { id: string; inputs: Inventory; outputs: Inventory; duration: number }
export interface BuildingDefinition { name: string; icon: string; color: number; width: number; height: number; cost: number; recipe?: RecipeDefinition; workerSlots: number; description: string; chain: string }
export interface ProductionJob { owner: string; remaining: number; total: number }
export interface BuildingState extends Point { id: string; kind: BuildingKind; rotated: boolean; level: number; output: Inventory; job?: ProductionJob }
export interface WorkerState extends Point { id: string; name: string; level: number; assignedBuilding?: string; phase: 'idle' | 'walking' | 'working' | 'hauling'; carrying: Inventory; path: Point[] }
export interface ContractDefinition { id: string; name: string; description: string; inputs: Inventory; reward: number; seconds: number; chapter: number }
export interface ContractState { definitionId: string; remaining: number }
export interface BoostState { multiplier: number; remaining: number }
export interface FacilityProgress { layout: 'facility-v1'; rooms: string[]; xp: number }
export interface GameState extends FacilityProgress { version: 1; money: number; elapsed: number; player: Point & { bag: Inventory; path: Point[]; activeBuilding?: string }; workers: WorkerState[]; buildings: BuildingState[]; inventory: Inventory; contract: ContractState; completedContracts: number; boost: BoostState; stats: { produced: Inventory; delivered: Inventory; collected: number }; milestones: number; settings: { paused: boolean; speed: number }; nextId: number; homeNeedTimer: number }
