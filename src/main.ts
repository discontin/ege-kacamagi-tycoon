import './resort/style.css';
import './resort/task-indicators.css';
import './resort/improvements.css';
import { AssetLibrary } from './game/AssetLibrary';
import { ASSET_CATALOG, type AssetKey } from './game/assetCatalog';
import { ResortSimulation } from './resort/Simulation';
import { ResortSaveService } from './resort/SaveService';
import { ResortWorld } from './resort/World';
import { ResortUI } from './resort/UI';

const testMode = new URL(location.href).searchParams.get('test') === '1';
const save = new ResortSaveService(undefined, testMode), loaded = save.load();
loaded.state.settings.paused = false;
const sim = new ResortSimulation(loaded.state, testMode), ui = new ResortUI(sim, save), assets = new AssetLibrary();
if (testMode) sim.notify('SINIRSIZ TEST: bütün tesisler açık, para ve havlu kısıtları yok. Normal oyun kaydın değişmez.');
else if (loaded.recovered) sim.notify('Kayıt okunamadı; güvenli yeni tatil köyü açıldı. Eski oyunun kaydı korunuyor.');
else if (loaded.existing) sim.notify('Tatil köyüne hoş geldin! Kaldığın yerden devam ediyoruz.');
const loading = document.createElement('div'); loading.className = 'resort-loading'; document.querySelector('#game')!.append(loading);
async function boot() {
  const keys = (Object.keys(ASSET_CATALOG) as AssetKey[]).filter(k => ASSET_CATALOG[k][0] !== 'factory-kit' && !['carrot', 'corn', 'lettuce'].includes(k));
  await assets.load((done, total) => { loading.innerHTML = `<div><span>☀</span><h2>Ege’ye küçük bir kaçamak…</h2><p>Tatil köyün hazırlanıyor · ${done}/${total}</p><progress value="${done}" max="${total}"></progress></div>`; }, keys);
  ui.world = new ResortWorld(sim, assets, id => ui.inspect(id)); loading.remove(); ui.render();
  if (assets.failed.length) sim.notify('Bazı modeller yüklenemedi; geçici görsellerle devam ediliyor.');
}
void boot().catch(error => { console.error(error); loading.innerHTML = '<div><h2>3D sahne açılamadı</h2><p>WebGL destekleyen güncel tarayıcıyla yeniden dene.</p></div>'; });
window.setInterval(() => { if (!save.save(sim.state)) sim.notify('Otomatik kayıt yapılamadı. Tarayıcı depolamasını kontrol et.'); }, 15000);
window.addEventListener('pagehide', () => save.save(sim.state));
document.addEventListener('visibilitychange', () => { if (document.hidden) { sim.state.settings.paused = true; save.save(sim.state); } });
