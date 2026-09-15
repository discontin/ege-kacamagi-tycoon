import { areasFor, LEVELS } from './data';
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
  if (empty) return s.player.bag.clean && (!empty.needsSheet || (s.player.bag.cleanSheets ?? 0)) ? goal('Temiz çamaşırı bırak', 'Temiz çarşafı ser ve havluyu yenile; oda yeniden hazır olsun.', empty.id + 'Work') : goal('Temiz çamaşır getir', 'Raftan temiz havlu ve çarşaf al, odaya taşı.', 'cleanTake');
  if (dirty && (!s.stats.cleaned || !rooms.some(f => !f.dirty && !f.floorDirty && !f.guest && f.towels))) {
    if (!testMode && linenCount(s.player.bag) + 2 > 8 && dirtyLinenCount(s.player.bag)) return goal('Çantanda yer aç', 'Kirli havluları çamaşırhaneye bırak.', 'dirtyDrop');
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
    const level = LEVELS.filter(x => s.xp >= x).length;
    if (level < 4) { const buy = areasFor(s).find(a => a.mode === 'buy' && a.target.startsWith('room') && Number(a.target.slice(4)) <= level); return goal('Havuza doğru büyü', 'Yeni bungalovlarla geliri artır; havuz seviye 4’te açılır.', buy?.id ?? 'checkin'); }
    return goal('Büyük hedef: havuz', '350 para: havuz, iki şezlong ve yepyeni bir hizmet.', 'poolBuy');
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
  if (id === 'pool') return `${level === 1 ? 25 : 30} ₺/ziyaret · hızlı hizmet + dekor`;
  return `${level === 1 ? '%20' : '%35'} hızlı karşılama · yeni bekleme koltuğu`;
}
export function cleaningProgress(remaining: number, total: number): number { return Math.max(0, Math.min(1, total > 0 ? 1 - remaining / total : 0)); }
