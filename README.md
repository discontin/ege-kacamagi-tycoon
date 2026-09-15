# Ege Kaçamağı — Tatil Köyü Tycoon

Three.js + TypeScript + Vite ile masaüstü/mobil tarayıcıda çalışan, low-poly 3D Ege tatil köyü prototipi. Gerçek müşteri kuyruğu, bungalov konaklaması, temizlik, fiziksel havlu taşıma, çamaşırhane, havuz ve görevli çalışanlar içerir.

## Çalıştırma

```sh
pnpm install --store-dir .pnpm-store
pnpm dev
pnpm test
pnpm build
```

Önizlemenin adresini Vite terminalinden alın (varsayılan http://localhost:5173; bu oturumda 5174). Sınırsız test için adrese `?test=1` ekleyin. Yeni paket veya uzak asset bağlantısı gerekmez; modeller yereldir, yazı tipi sistem fontudur.

## Oynanış

- Başlangıç: 150 para, girişe yakın bir hazır bungalov, resepsiyon, çamaşırhane ve rafta sekiz temiz havlu.
- Beyaz karede durarak otomatik çalışın. Gölgeliksiz resepsiyon bankosunun arkasındaki kare üç saniyede müşteri karşılar; müşteriler bankonun önünde tek sıra bekler. Müşteri odaya yürür; ilk üç konaklama 12/18/24 saniye, sonrakiler 40 saniyedir. İlk misafir iki saniyede gelir.
- Konaklama resepsiyon kasasına 40 para bırakır. Para yığınına yürüyerek alın. Oda kirlenir, havlu yenilenene kadar müşteri alamaz.
- Odanın içinde altı saniye temizlik yapın; kirli havlu çantaya alınır. Kirliyi çamaşırhaneye bırakın. Makine dört saniyede yıkar.
- Yapılacak işler nesnelerin üzerinde mavi, beyaz çerçeveli yuvarlak simgelerle gösterilir: temizlik, havlu, misafir ve para. Çalışırken simge yeşile döner ve ilerleme halkası gösterir; iş tamamlanınca değişir veya kaybolur. Simgeye dokunmak ilgili çalışma karesine yürütür, ayrıca etkileşim tuşu gerekmez.
- Temiz havlu alma karesinden en fazla dört temiz havlu alın; sekiz kapasiteli çantada kirli havlu için yer kalır. Odada bekleyerek bir temiz havlu bırakın.
- Yeşil alan: yeni bungalov/havuz/şezlong. Sarı alan: üç seviyeli görsel yükseltme. 1,3 saniye bekleyin; ikinci satın alma için ayrılıp dönün.
- Havuz seviye 4 ve 350 parayla açılır; iki şezlong ve dört havlu dahildir. Diğer şezlonglar 100’er paradır.
- Konaklamasını bitiren müşteri uygun yer varsa havuza gider. Girişte karşılayın, rafta havlu bulundurun. Kullanım 25 saniye ve 20 paradır; şezlongu dört saniyede temizleyin.
- Seviye 2’de ilk çalışan 100 para; sonraki çalışan başına +50 para. Normal sınır beş. Resepsiyon, oda, havuz veya taşıma rolünü seçin; aynı işi iki kişi alamaz.
- Çalışan iş verimliliği seviyelerde %65/%80/%100; eğitim 120 ve 240 para. Fiziksel olarak havlu alıp taşırlar.
- Tesis iş süreleri seviyelerde %100/%80/%65; bungalov/havuz gelirleri %100/%125/%150. Resepsiyon yükseltmesi kabul süresini, çamaşırhane yükseltmesi yıkama süresini ve raf kapasitesini geliştirir.
- Konaklama +10 XP, oda temizliği +5, havuz ziyareti +5. Eşikler 0/15/50/100/180/280 XP; ek bungalov fiyatları 100/180/260/380/520.
- WASD/oklar, yere dokunarak yürüme veya mobil joystick. Etkileşim tuşu yok. Boşluk duraklatır; 1×/2× zamanı hızlandırır. Sürükleme kamerayı gezdirir, tekerlek/iki parmak yakınlaştırır, ◎ karaktere döner.
- Yarım kalan saha işi aynı kareye dönünce sürer. İptal düğmesi rezervasyonu serbest bırakır.

## Oyun hissi ve rehberlik

Temizlikte süpürge görünür, kir parçaları görev ilerledikçe silinir ve yatak örtüsü düzelir. Para oyuncuya akan parçacıklarla toplanır; temizlik, teslimat, inşa ve seviye atlama kısa görsel/sesli ödüller verir. Raflardaki havlu yığınları gerçek stokla değişir; yıkama sırasında makine hareket eder. Yükseltme alanları somut gelir/hız/kapasite kazancını gösterir; konfor oda ve sahil süiti yatak, halı, lamba ve dekorla ayrılır.

Duruma bağlı hedefler çanta, kirli oda, boş havlu ve çalışan ihtiyacını dikkate alır. Hedef karesinde altın bir işaret, seçilen yürüyüş rotasında noktalar görünür. Üst şerit hazır/dolu/kirli oda ve yardımcı sayısını gösterir. Uzak gelecek alan etiketleri sadeleştirilir; harita koordinatları, mevcut görevler ve kayıt şeması korunur. Geri bildirim efektleri geçicidir; kayıttan yüklenince tekrar para veya XP vermez.

## Kayıt ve test modu

Normal kayıt anahtarı `ege-kacamagi-save-v1`. 15 saniyede bir, sayfa kapanırken ve sekmeden ayrılırken kaydedilir; elle kayıt Rehber panelindedir. Sekmeden ayrılınca duraklar; çevrimdışı gelir yoktur. Geçersiz kayıt güvenli başlangıca döner.

Eski `copten-sehre-save-v1` ve avlu yedeği **okunmaz, dönüştürülmez, silinmez**. Rehberde Yeni köy kur yalnızca yeni konsepti sıfırlar.

`?test=1` tüm tesisleri açar, para/havlu kısıtlarını ve çanta/çalışan limitlerini kaldırır. Temizlik, konaklama, rezervasyon, üç yükseltme seviyesi ve gerçek taşıma korunur. Test modu hiçbir kayıt okumaz/yazmaz; yenilenince sıfırlanır. Normal oyuna dön mevcut normal köyü açar.

Deneme hız bonusu 120 simülasyon saniyesi %50 iş/üretim hızıdır, birikmez ve duraklatılınca donmuş kalır. Gerçek reklam yoktur.

## Teknik yapı ve doğrulama

- `src/resort/Simulation.ts`: hareket/yol bulma, müşteriler, görev rezervasyonu, havlu döngüsü, çalışanlar ve ekonomi.
- `src/resort/World.ts`: sahil haritası, kesit bungalovlar, havuz, karakter animasyonları ve kareler.
- `src/resort/TaskIndicators.ts`: mevcut durumdan türetilen nesne üstü görev simgeleri; ayrı görev veya kayıt oluşturmaz.
- `src/resort/UI.ts`: hedefler, köy/ekip/rehber panelleri ve dokunmatik arayüz.
- `src/resort/types.ts`, `data.ts`, `SaveService.ts`: veri modelleri, yerleşim/denge ve izole kayıt.
- `src/game/AssetLibrary.ts`: önceki sürümden tekrar kullanılan GLB yükleyici; yeni oyun fabrika modellerini yüklemez.

89 otomatik test (12 başlangıç/yönlendirme + 10 görev simgesi + 26 tatil köyü + 41 önceki altyapı/regresyon testi) müşteri konaklamasını, yıkama/taşıma döngüsünü, havuzu, görev yarışlarını, kapasite engellerini, satın alma kilitlerini, yol erişimini, zaman kontrolünü ve kayıt izolasyonunu doğrular. Görev simgelerinin doğru nesnede görünmesi, temizlikten havluya dönüşmesi ve hazır odada kaybolması test edilir. Resepsiyonun doğru tarafında çalışma ve eski çalışan rotalarının yeni kareye taşınması da test edilir. On dakikalık çalışanlı simülasyonda havlu sayısının korunduğu doğrulanır. Eski oyun kaynakları regresyon ve yeniden kullanılabilir altyapı için korunur; aktif giriş tatil köyüdür.

Kenney CC0 karakter/doğa/mobilyaları yeniden kullanılır; yatak, havlu, çamaşır makinesi, şezlong, havuz ve sahil yapıları özgün Three.js geometrisidir. Lisans kayıtları [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) içindedir. İlk sürümde restoran, spa, plaj hizmetleri ve otopark yalnızca gelecek içerik olarak gösterilir. Sunucu, hesap, çok oyunculu sistem, gerçek reklam, arka plan müziği ve 8–12 saatlik kampanya yoktur. Kısa etkileşim sesleri Web Audio ile üretilir; ♪ düğmesi sesi kapatır.
