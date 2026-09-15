# Üçüncü taraf 3D assetler

## Ege Kaçamağı sürümü

Tatil köyü; Kenney modellerini, havuz için OpenGameArt dokusunu ve 3DAssets.dev şezlong modelini kullanır. Başka bir oyundan çıkarılmış dosya veya ekran görüntüsü kullanılmamıştır.

13 Eylül 2026 tarihinde doğrudan Kenney'nin resmî sitesinden alınmıştır. Kullanılan modellerin tam listesi `src/game/assetCatalog.ts` içindedir. Başka bir oyundan çıkarılmış dosya veya ekran görüntüsü kullanılmamıştır.

## Kaynak ve lisans

| Paket | Kullanım | Arşiv sürümü | Lisans |
| --- | --- | --- | --- |
| [Mini Characters](https://kenney.nl/assets/mini-characters) | Oyuncu, dört meslek görünümü ve on farklı müşteri; iskeletli animasyonlar | 1.0 | CC0 |
| [Factory Kit](https://kenney.nl/assets/factory-kit) | Üretim makineleri, bantlar, robot kolu, borular, kasalar, zemin düğmeleri | 3.0 | CC0 |
| [Nature Kit](https://kenney.nl/assets/nature-kit) | Farklı palmiye ağaçları, çalılar, kayalar ve renkli çiçekler | 2.1 | CC0 |
| [Furniture Kit](https://kenney.nl/assets/furniture-kit) | Yataklar, pencere, ofis masası/sandalyesi, raflar, mobilyalar ve saksılar | 2.0 | CC0 |
| [Blue Pool Tiles](https://opengameart.org/content/blue-pool-tiles) | Havuz içi mozaik albedo ve normal dokuları | 1.0 | CC0 |
| [Hotel and Resort Operations](https://3dassets.dev/packs/hotel-and-resort-operations) | Havuz kenarı şezlongu | v1 | CC0 |
| [Laundromat and Cleaning Services](https://3dassets.dev/packs/laundrette-and-cleaning) | Ticari çamaşır makinesi, üst üste makine ve tekerlekli çöp kutusu | v1 | CC0 |
| [Pavement 05](https://polyhaven.com/a/pavement_05) | Orta yürüyüş yolunun taş kaplama dokusu | 1K | CC0 |

Her kaynağın `License.txt` dosyası kendi `public/assets/...` klasöründe korunur ve build çıktısına kopyalanır. Bu dosyalar kişisel ve ticari kullanıma izin verir; atıf zorunlu değildir. Kenney için isteğe bağlı kredi: “3D assets by Kenney (kenney.nl)”. [CC0 metni](https://creativecommons.org/publicdomain/zero/1.0/).

GLB dosyaları değiştirilmeden kopyalanmıştır. Ölçek, yerleşim ve bazı doğa malzemelerinin rengi oyun çalışırken ayarlanır. Factory Kit ve Mini Characters GLB'lerinin başvurduğu `Textures/colormap.png` dosyaları korunmalıdır. Evler, platformlar, duvarlar, araçlar ve bazı üretim detayları oyun koduyla oluşturulur; referans oyunun modelleri kullanılmaz.

Blue Pool Tiles dosyaları 15 Eylül 2026'da OpenGameArt kaynağından indirilmiştir. Poolside Sun Lounger, ticari çamaşır makineleri ve tekerlekli çöp kutusu aynı tarihte 3DAssets.dev CDN'inden alınmıştır; kaynak sayfaları modellerin CC0 olduğunu ve atıf gerektirmediğini belirtir. Pavement 05'in 1K diffuse haritası Poly Haven'ın resmî indirme sunucusundan alınmıştır.

## İndirme doğrulamaları

SHA-256 değerleri indirilen tam ZIP arşivlerine aittir; seçilmiş model dosyalarının hash'i değildir.

### Factory Kit

[Resmî ZIP](https://kenney.nl/media/pages/assets/factory-kit/edaac9d4f6-1777639602/kenney_factory-kit_3.0.zip)

`7E31FB2308E90304672BD15CD18FA9D9F02C03731A8CBC57A8E3E1C181DFB0A7`

### Nature Kit

[Resmî ZIP](https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip)

`FA7974A0D342BFE63C38664BA9F8EC1A4AAB8EA25F099BDC56870E33588C4D9D`

### Furniture Kit

[Resmî ZIP](https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip)

`E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0`

### Mini Characters

[Resmî ZIP](https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip)

`9E1D48E6D7B8479EBBE84DF71EB5BD8E1B3F0DA546DEA641890DCCC8A02D0999`

## Yeniden oluşturma

`scripts/Download-KenneyAssets.ps1` resmî paket sayfalarındaki ZIP bağlantılarını indirip `.asset-cache/kenney` içinde açar. `scripts/Copy-KenneyAssets.ps1` katalogdaki 35 GLB'yi, gereken dokuları ve lisansları `public/assets/kenney` içine kopyalar. İndirme gerekmeksizin mevcut public dosyalarıyla oyun çalışır. Paketler ileride değişebileceğinden yeniden indirmede lisans ve hash değerleri yeniden kontrol edilmelidir.
# Kenney Furniture Kit and Food Kit

Selected GLB models from Kenney Furniture Kit and Food Kit are included under `public/assets/kenney/`. Both packs are licensed CC0 1.0. Sources: https://kenney.nl/assets/furniture-kit and https://kenney.nl/assets/food-kit

## Poly Haven Herringbone Parquet

The bungalow floors use the 1K JPG diffuse map from [Herringbone Parquet](https://polyhaven.com/a/herringbone_parquet), downloaded from Poly Haven on 15 September 2026. The asset is licensed CC0 and is stored under `public/assets/polyhaven/herringbone-parquet/`.
