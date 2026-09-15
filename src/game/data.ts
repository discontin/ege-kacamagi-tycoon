import type { BuildingDefinition, BuildingKind, ContractDefinition, Resource } from './types';
export const MAP_WIDTH = 34;
export const MAP_HEIGHT = 38;
export const BAG_CAPACITY = 12;
export const RESOURCES: Record<Resource, { name: string; icon: string; color: string }> = {
  waste: { name: 'Atık', icon: '♻', color: '#748573' }, organic: { name: 'Organik', icon: '🍂', color: '#bd864f' },
  fiber: { name: 'Lif', icon: '🧵', color: '#bda17a' }, metal: { name: 'Metal', icon: '🔩', color: '#7b9aaa' },
  compost: { name: 'Kompost', icon: '🌱', color: '#7a9c50' }, vegetable: { name: 'Sebze', icon: '🥕', color: '#e49150' },
  meal: { name: 'Yemek', icon: '🥗', color: '#edbd60' }, furniture: { name: 'Mobilya', icon: '🪑', color: '#b98465' },
  biogas: { name: 'Biyogaz', icon: '🫧', color: '#8db9ac' }, electricity: { name: 'Enerji', icon: '⚡', color: '#d9b53c' }
};
export const RESOURCE_IDS = Object.keys(RESOURCES) as Resource[];
export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  collection: { name: 'Atık noktası', icon: '♻', color: 0x7f9e87, width: 2, height: 2, cost: 60, workerSlots: 1, chain: 'Kaynak', description: 'Her 8 saniyede atık oluşur. Topla ve depoya taşı.', recipe: { id: 'collect', inputs: {}, outputs: { waste: 3 }, duration: 4 } },
  recycling: { name: 'Geri dönüşüm', icon: '♻', color: 0x52a68d, width: 2, height: 2, cost: 180, workerSlots: 1, chain: 'Kaynak', description: 'Karışık atığı organik, lif ve metale ayrıştırır.', recipe: { id: 'sort', inputs: { waste: 3 }, outputs: { organic: 2, fiber: 1, metal: 1 }, duration: 8 } },
  composter: { name: 'Kompost alanı', icon: '🌱', color: 0x94ad67, width: 2, height: 2, cost: 130, workerSlots: 1, chain: 'Gıda', description: 'Organik atıktan verimli toprak üretir.', recipe: { id: 'compost', inputs: { organic: 2 }, outputs: { compost: 2 }, duration: 7 } },
  farm: { name: 'Kent bahçesi', icon: '🥕', color: 0xa2bf73, width: 3, height: 2, cost: 150, workerSlots: 1, chain: 'Gıda', description: 'Kompost ile taze sebzeler yetiştir.', recipe: { id: 'grow', inputs: { compost: 1 }, outputs: { vegetable: 3 }, duration: 10 } },
  kitchen: { name: 'Mahalle mutfağı', icon: '🥗', color: 0xe8af70, width: 2, height: 2, cost: 220, workerSlots: 1, chain: 'Gıda', description: 'Sebzelerden mahalle için sıcak yemekler yap.', recipe: { id: 'cook', inputs: { vegetable: 2 }, outputs: { meal: 2 }, duration: 8 } },
  workshop: { name: 'Mobilya atölyesi', icon: '🪑', color: 0xb18c72, width: 2, height: 2, cost: 240, workerSlots: 1, chain: 'Mobilya', description: 'Geri kazanılmış lif ve metalden mobilya üret.', recipe: { id: 'craft', inputs: { fiber: 1, metal: 1 }, outputs: { furniture: 1 }, duration: 12 } },
  biogas: { name: 'Biyogaz tesisi', icon: '🫧', color: 0x78b6ba, width: 2, height: 2, cost: 210, workerSlots: 1, chain: 'Enerji', description: 'Organik atığı temiz yakıta dönüştür.', recipe: { id: 'ferment', inputs: { organic: 2 }, outputs: { biogas: 2 }, duration: 10 } },
  generator: { name: 'Jeneratör', icon: '⚡', color: 0xd5ba62, width: 2, height: 2, cost: 190, workerSlots: 1, chain: 'Enerji', description: 'Biyogazdan mahalle için elektrik üret.', recipe: { id: 'power', inputs: { biogas: 1 }, outputs: { electricity: 3 }, duration: 7 } },
  warehouse: { name: 'Mahalle deposu', icon: '📦', color: 0x729ca8, width: 3, height: 2, cost: 260, workerSlots: 0, chain: 'Şehir', description: 'Her depo stok kapasitesini 100 artırır.' },
  home: { name: 'Yaşam evi', icon: '🏡', color: 0xdb9380, width: 2, height: 2, cost: 140, workerSlots: 0, chain: 'Şehir', description: 'Yemek, mobilya ve enerji teslim ederek gelir kazan.' },
  shop: { name: 'Kooperatif', icon: '🏪', color: 0xa88cbb, width: 2, height: 2, cost: 180, workerSlots: 0, chain: 'Şehir', description: 'Depodaki ürünlerle şehir sözleşmelerini teslim et.' }
};
export const CONTRACTS: ContractDefinition[] = [
  { id: 'sorting', name: 'İlk geri kazanım', description: 'Lobideki müşteriye ayrıştırılmış malzemeleri teslim et.', inputs: { organic: 4, fiber: 2, metal: 2 }, reward: 90, seconds: 240, chapter: 1 },
  { id: 'first', name: 'İlk sofra', description: 'Komşular ilk hasadı bekliyor.', inputs: { meal: 2 }, reward: 180, seconds: 240, chapter: 1 },
  { id: 'garden', name: 'Yeşil mahalle', description: 'Kent bahçelerine destek ol.', inputs: { compost: 3, vegetable: 3 }, reward: 220, seconds: 240, chapter: 1 },
  { id: 'table', name: 'Yeni başlangıç', description: 'Topluluk merkezi için yeni masalar.', inputs: { furniture: 2 }, reward: 260, seconds: 300, chapter: 2 },
  { id: 'power', name: 'Işıklar yansın', description: 'Mahalleye temiz enerji sağla.', inputs: { electricity: 6 }, reward: 250, seconds: 240, chapter: 3 },
  { id: 'festival', name: 'Mahalle şenliği', description: 'Döngüsel ekonominin tüm ürünleri bir arada.', inputs: { meal: 4, furniture: 2, electricity: 6 }, reward: 550, seconds: 360, chapter: 4 }
];
export const CHAPTERS = [
  { name: 'Yeni bir başlangıç', description: 'Atığı ayrıştır, kompost üret, ilk sofrayı kur.', available: true },
  { name: 'İkinci bir hayat', description: 'Geri kazanılmış malzemelerden bir şehir kur.', available: false },
  { name: 'Temiz enerji', description: 'Mahallenin ışığını kendi kaynaklarından üret.', available: false },
  { name: 'Birlikte büyümek', description: 'Yeni mahalleler, ticaret ve kooperatifler.', available: false },
  { name: 'Yaşayan döngü', description: 'Şehrini optimize et ve özgürce büyüt.', available: false }
];
export const WORKER_NAMES = ['Deniz', 'Ece', 'Can', 'Ada', 'Mert'];
