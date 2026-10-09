export type TutorialSection = 'rooms' | 'laundry';

type Step = { image: string; title: string; text: string; size: [number, number]; crop: [number, number, number] };
const rooms: Step[] = [
  { image: 'bed-cleaning', title: 'Yatağı temizle', text: 'Yatağın hemen yanında bekle. Temizlik tamamlanınca kirli çarşaf çantana gelir.', size: [739, 483], crop: [180, 65, 300] },
  { image: 'floor-cleaning', title: 'Zemini süpür', text: 'Süpürge simgesinin bulunduğu alana git ve iş bitene kadar bekle.', size: [713, 399], crop: [130, 95, 320] },
  { image: 'clean-sheet', title: 'Temiz çarşaf ser', text: 'Temiz raftan çarşaf alıp yatağın yanına dön. Yanında bekleyerek temiz çarşafı ser.', size: [864, 520], crop: [265, 155, 340] },
];
const laundry: Step[] = [
  { image: 'dirty-hamper', title: 'Kirliyi sepete bırak', text: 'Kirli çarşaf ve havlularla sepetin yanına git. Görev alanında bekleyerek kirlileri bırak.', size: [726, 394], crop: [170, 115, 300] },
  { image: 'dirty-rack', title: 'Kirli raftan al', text: 'Kirli rafın yanına gidip çamaşır al. Bu raf yalnızca almak içindir; kirlileri sepete bırak.', size: [721, 416], crop: [235, 85, 280] },
  { image: 'washer', title: 'Makineye koy', text: 'Kirli çamaşırları makineye yükle. Yıkama bitince makineyi boşalt; temizler temiz rafa eklenir.', size: [741, 394], crop: [175, 85, 320] },
];
const trash: Step = { image: 'trash', title: 'Gerekirse çöpe at', text: 'İhtiyaç duymadığın çamaşırları çöp kutusunun yanında bekleyerek atabilirsin. Bu işlem zorunlu değildir.', size: [686, 490], crop: [170, 175, 320] };

function picture(step: Step, number?: number) {
  const [x, y, width] = step.crop;
  const scale = 100 / width;
  return `<div class="guide-picture"><img src="./assets/tutorial/${step.image}.png" alt="${step.title}" width="${step.size[0]}" height="${step.size[1]}" style="width:${step.size[0] * scale}%;left:${-x * scale}%;top:${-y * scale / .75}%">${number ? `<span class="guide-step-badge">${number.toString().padStart(2, '0')}</span>` : ''}</div>`;
}

export function tutorialScreen(section: TutorialSection, firstLaunch: boolean) {
  const steps = section === 'rooms' ? rooms : laundry;
  return `<section class="screen-shell tutorial-shell">
    <header class="screen-header"><span class="screen-brand-icon">☀</span><div><small>OLIVE COAST · REHBER</small><h1>Nasıl Oynanır</h1></div><button class="screen-close" data-action="tutorial-back" aria-label="Kapat">×</button></header>
    <div class="tutorial-content">
      <div class="guide-toolbar"><div class="guide-tabs" role="group" aria-label="Rehber bölümleri">
        <button data-action="tutorial-section" data-section="rooms" aria-pressed="${section === 'rooms'}">Oda Temizliği</button>
        <button data-action="tutorial-section" data-section="laundry" aria-pressed="${section === 'laundry'}">Çamaşırhane</button>
      </div></div>
      <div class="tutorial-steps">${steps.map((step, i) => `<article class="tutorial-step">${picture(step, i + 1)}<h3>${step.title}</h3><p>${step.text}</p></article>`).join('')}</div>
      ${section === 'laundry' ? '<aside class="guide-note"><span aria-hidden="true">✓</span><p>Temiz raftan havlu ve çarşaf alıp odalara taşı. Raf boşsa önce çamaşırları yıka veya ofisten temiz havlu satın al.</p></aside>' : ''}
      ${section === 'laundry' ? `<article class="tutorial-step guide-optional">${picture(trash)}<div><small>İSTEĞE BAĞLI</small><h3>${trash.title}</h3><p>${trash.text}</p></div></article>` : ''}
      <section class="tutorial-controls"><div><span class="screen-setting-icon mint">⌘</span><div><b>Kontroller</b><small>Klavyede WASD / ok tuşları · mobilde hareket çubuğu</small></div></div><div><kbd>ESC</kbd><span>Mola menüsü</span><small>Etkileşim tuşu yok; görev alanında bekle.</small></div></section>
    </div><p class="startup-status tutorial-status" id="startup-status" role="status"></p>
    <footer class="screen-footer"><span>İlerleme bu cihazda otomatik kaydedilir.</span><div>${firstLaunch ? '<button class="tutorial-skip" data-action="skip-tutorial">Atla</button><button class="screen-primary-button" data-action="tutorial-start">Başlayalım</button>' : '<button class="screen-primary-button" data-action="tutorial-back">← &nbsp; Geri</button>'}</div></footer>
  </section>`;
}
