import { areasFor, LEVELS, POOL_UNLOCK_LEVEL, ROOM_DEFS } from './data';
import type { ResortGameState } from './types';
import { dirtyLinenCount, linenCount } from './Linen';
import { wantsDrink } from './PoolServices';

export interface ResortGoal { title: string; body: string; area: string }
export function resortGoal(s: ResortGameState, testMode = false): ResortGoal {
  const rooms = s.facilities.filter(f => f.kind === 'room' && f.open);
  const dirty = rooms.find(f => (f.dirty || f.floorDirty || f.bathroomDirty) && !f.guest);
  const empty = rooms.find(f => !f.dirty && !f.floorDirty && !f.bathroomDirty && !f.guest && (!f.towels || f.needsSheet));
  const cash = s.facilities.find(f => f.id === 'reception')!.cash;
  const goal = (title: string, body: string, area: string): ResortGoal => ({ title, body, area });
  if (!s.stats.welcomed) return goal('İlk misafirini karşıla', 'Bankonun arkasındaki beyaz kareye yürü.', 'checkin');
  if (!s.stats.earned && cash) return goal('İlk kazancını topla', `${cash} para kasada! Para yığınına yaklaş.`, 'receptionCash');
  if ((s.facilities.find(f => f.id === 'pool')!.dirt ?? 0) >= 4) return goal('Havuzu yeniden aç', 'Kepçeyle yaprakları temizle; yeni misafirler bakım bitince kabul edilir.', 'poolClean');
  if (!s.stats.stays && !empty && !dirty) return goal('Misafirin dinleniyor', 'Konaklama ücretini girişte aldın; oda boşalınca bakımını yapabilirsin.', '');
  // After collecting dirty linen from a room, put it in the hamper before
  // asking the player to collect fresh linen for that room.
  if (dirtyLinenCount(s.player.bag)) return goal('Kirli çamaşırı bırak', 'Kirli havlu ve çarşafları sol köşedeki kirli çamaşır sepetine bırak.', 'dirtyDrop');
  if (empty) return s.player.bag.clean && (!empty.needsSheet || (s.player.bag.cleanSheets ?? 0)) ? goal('Temiz çamaşırı bırak', 'Temiz çarşafı ser ve havluyu yenile; oda yeniden hazır olsun.', empty.id + 'Work') : goal('Temiz çamaşır getir', 'Raftan temiz havlu ve çarşaf al, odaya taşı.', 'cleanTake');
  if (dirty && (!s.stats.cleaned || !rooms.some(f => !f.dirty && !f.floorDirty && !f.guest && f.towels))) {
    return dirty.dirty ? goal('Yatağı toparla', 'Yatağın herhangi bir kenarında dur; çarşafı düzelt ve kirli havluyu al.', dirty.id + 'Work') : goal('Zemini süpür', 'Süpürge simgesinin altındaki alana yürü; yerdeki çöpleri temizle.', dirty.id + 'Floor');
  }
  if (!s.stats.washed) {
    if (dirtyLinenCount(s.player.bag)) return goal('Havluyu yeniden kullan', 'Kirli havluyu sepete bırak; makine kendisi yıkar.', 'dirtyDrop');
    if (s.laundry.dirty || s.laundry.dirtySheets || s.laundry.remaining !== null) return goal('Makine senin yerine çalışıyor', 'Yıkamayı beklerken yeni misafiri karşılayabilirsin.', 'checkin');
  }
  if (rooms.length < 2) {
    const level = LEVELS.filter(x => s.xp >= x).length;
    return level < 2 ? goal('Bir misafir daha ağırlayalım', 'Konaklama ve temizlikle ikinci bungalovu aç.', 'checkin') : goal('İkinci bungalovun hazır', '100 para yatır: aynı anda iki misafir, daha çok gelir.', 'room2Buy');
  }
  if (!s.workers.length) return goal('Temizliği yardımcına devret', 'Ekipten bir temizlikçi al. Sen yeni tesislere odaklan.', '');
  const pool = s.facilities.find(f => f.id === 'pool')!;
  if (!pool.open) {
    if (rooms.length < ROOM_DEFS.length) {
      const nextRoom = ROOM_DEFS.find(r => !rooms.some(open => open.id === r.id));
      const level = LEVELS.filter(x => s.xp >= x).length;
      const nextRoomArea = nextRoom && areasFor(s).find(a => a.id === `${nextRoom.id}Buy`);
      if (nextRoom && nextRoomArea && level >= nextRoom.unlockLevel) return goal('Önce altı odayı aç', `Havuzdan önce tüm bungalovları aç; sıradaki ${nextRoom.name}.`, nextRoomArea.id);
      return goal('Önce altı odayı aç', `Havuzu açmak için ${ROOM_DEFS.length - rooms.length} oda daha açmalısın. Misafir ağırlayıp Seviye ${nextRoom?.unlockLevel ?? 6} ve gerekli parayı kazan.`, 'checkin');
    }
    const level = LEVELS.filter(x => s.xp >= x).length;
    if (level < POOL_UNLOCK_LEVEL) return goal('Havuz için seviye kazan', `Altı oda hazır. Havuzu açmak için Seviye ${POOL_UNLOCK_LEVEL} ol; müşteri karşılayıp XP kazan.`, 'checkin');
    return goal('Büyük hedef: havuz', 'Altı oda ve gerekli seviye hazır! Havuzu aç, dört şezlong ve yeni hizmeti köyüne kat.', 'poolBuy');
  }
  if (!s.stats.poolVisits) {
    if (!pool.towels) return goal('Havuz havlu bekliyor', 'Temiz havlu alıp havuz rafına taşı.', s.player.bag.clean ? 'poolStock' : 'cleanTake');
    return goal('İlk havuz misafiri', 'Havuzun giriş karesinde misafiri karşıla.', 'poolCheckin');
  }
  if (!s.bar?.open) return goal('Havuz barını aç', '200 ₺ karşılığında limonata servisini köyüne kat.', 'barBuy');
  const order = s.guests.find(wantsDrink);
  if (order) return s.player.drink ? goal('Limonatayı teslim et', 'Bardak isteyen misafirin şezlonguna yaklaş.', `drink:${order.id}`) : goal('Bir limonata hazırla', 'Barda dur, tepsiyi al ve misafire götür.', 'barPrepare');
  const next = areasFor(s).find(a => a.mode === 'buy' && a.target.startsWith('room'));
  if (next) return goal('Kaçamağını büyüt', 'Yeni odalar aç; eski işleri çalışanlarına devret.', next.id);
  const roomUpgrade = areasFor(s).find(a => a.mode === 'upgrade' && a.target.startsWith('room'));
  return roomUpgrade ? goal('Odalarını konforlu yap', 'Standart odaları banyolu konfor odalarına yükselt.', roomUpgrade.id) : goal('Köy senin!', 'Misafirlerini ağırlamaya ve ekibini geliştirmeye devam et.', 'checkin');
}
export function upgradeBenefit(id: string, level: number): string {
  if (id.startsWith('room')) return level === 1 ? 'Konfor oda · 50 ₺/misafir · banyo · %20 hızlı iş' : 'En yüksek oda seviyesi';
  if (id === 'laundry') return `Makine: ${level === 1 ? 5 : 7} parça · daha hızlı yıkama`;
  if (id === 'pool') return level === 1 ? '6 şezlong · geniş havuz · 25 ₺/ziyaret' : 'En yüksek havuz seviyesi';
  return `${level === 1 ? '%20' : '%35'} hızlı karşılama · yeni bekleme koltuğu`;
}
export function cleaningProgress(remaining: number, total: number): number { return Math.max(0, Math.min(1, total > 0 ? 1 - remaining / total : 0)); }
