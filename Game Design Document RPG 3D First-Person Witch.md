# Game Design Document: RPG 3D First-Person Witch

Nov 23, 2026 · @vmk

## Visi & pilar desain

*Crimson Sovereign* (judul kerja) adalah RPG aksi 3D first-person: kamu seorang penyihir yang membengkokkan realitas dengan sihir kekacauan, lalu membangkitkan musuh yang kamu kalahkan menjadi pasukan bayangan.

Fantasi pemain: mulai sebagai penyihir rapuh, tumbuh menjadi penguasa medan perang yang tangannya sendiri mengubah dunia. Setiap pertarungan harus terasa membuatmu lebih kuat, dan setiap kemenangan meninggalkan sesuatu yang bisa dilihat: satu bayangan baru di sisimu.

Empat pilar desain:

1. **Kekuatan terasa di tangan.** Dua tangan selalu terlihat di layar: kiri merah (Chaos), kanan ungu gelap (Umbra). Tiap sihir punya cahaya, suara, dan guncangan kamera yang jelas.
2. **Realitas bisa dibengkokkan.** Musuh dan objek bisa diangkat, dilempar, dihancurkan, atau dibalik gravitasinya.
3. **Kemenangan menjadi pasukan.** Musuh yang kalah bisa dibangkitkan, bertarung bersamamu, dan ikut tumbuh.
4. **Selalu ada langkah maju.** Setiap Rift (dungeon) selesai dalam 8 sampai 12 menit dan memberi XP, skill, atau bayangan baru.

Dua referensi utama dan cara dipakainya:

| Referensi | Yang dipinjam | Yang diubah di game ini |
| --- | --- | --- |
| Scarlet Witch (Marvel) | Sihir kekacauan merah, telekinesis, pembengkokan realitas | Dibatasi mana dan meter Chaos; seluruh efek merah menjadi identitas tangan kiri |
| Sung Jin-Woo (Solo Leveling) | Sistem level dan stat, membangkitkan musuh jadi pasukan bayangan | Menjadi menu "Ledger" dan "Umbra Rite"; kebangkitan bisa gagal, tidak otomatis |

## Dunia & karakter

Dunia game ini dikepung Rift, retakan dimensi yang memuntahkan monster dan bisa dimasuki sebagai dungeon; sang witch adalah satu-satunya orang yang menguasai dua kekuatan sekaligus.

- **Dunia:** kota modern-fantasi yang terus diserang Rift. Rift dibagi dalam lima tier (lihat bagian Musuh). Orang biasa mengungsi, para Penjaga Rift masuk berkelompok, sementara sang witch masuk sendirian.
- **Karakter:** Ilyra Vane (nama kerja), penyihir terakhir dari coven yang dihancurkan Rift pertama. Sihir kekacauan mengalir di darahnya: kuat, tetapi tidak stabil dan melukai tubuhnya bila dipaksa.
- **Kenapa dua kekuatan:** di Rift terdalam Ilyra hampir mati dan menerima Perjanjian dari penguasa bayangan yang sudah tewas. Perjanjian itu memberinya Ledger (sistem level yang menstabilkan Chaos) dan Umbra Rite (kemampuan membangkitkan yang kalah).
- **Dua tangan, dua sifat:** Chaos (merah, tangan kiri) adalah kekuatan mentah dan merusak. Umbra (ungu gelap, tangan kanan) adalah kekuatan yang membangun pasukan. Menyatukan keduanya menjadi busur cerita sekaligus busur progresi.
- **Nada:** gelap dan sinematik. Karena kamera first-person, wajah Ilyra tidak terlihat; identitasnya dibawa lewat suara, tangan, monolog batin, dan pesan Ledger.

## Gerakan, kamera FPS & tangan sihir

Pemain bergerak cepat dan bisa melayang, dengan kamera first-person yang selalu menampilkan dua tangan sihir sebagai pusat visual layar.

Nilai di bawah adalah titik awal untuk di-tuning saat prototype, bukan angka final.

| Aksi | Input (PC) | Nilai awal |
| --- | --- | --- |
| Jalan / lari | WASD / Shift | 5 m/dtk / 8 m/dtk |
| Lompat | Spasi | Tinggi 1,2 m |
| Melayang (Crimson Float) | Tahan Spasi di udara | Maks 5 dtk; stamina 100 habis 20/dtk, pulih di tanah |
| Menunduk / slide | Ctrl | Slide 1 dtk saat lari |
| Interaksi | F | Jarak 3 m |
| Menu Ledger (status) | Tab | Game dijeda |

**Kamera.** Sudut pandang 80° (90° saat lari), head bob kecil, dan opsi untuk mematikan head bob dan guncangan kamera demi pemain yang mudah mual.

**Tangan sihir.** Dua model tangan menempel di sudut bawah layar. Tangan kiri bercahaya merah dan menjadi sumber semua sihir Chaos; tangan kanan bercahaya ungu gelap dan menjadi sumber Arise serta perintah pasukan. Tiap tangan punya empat kondisi visual:

- Diam: cahaya redup berdenyut pelan.
- Mengisi: partikel terkumpul di telapak saat tombol ditahan.
- Melepas: kilatan, guncangan kamera singkat, dan suara khas per skill.
- Overload: kedua tangan menyala penuh merah saat meter Chaos penuh.

**HUD minimal.** Bar HP, mana, dan stamina di kiri bawah; meter Chaos melingkar di sekitar crosshair; ikon slot bayangan di kanan bawah.

## Chaos Magic

Chaos Magic adalah gaya bertarung utama: enam skill yang berpusat pada telekinesis, ledakan, dan pembengkokan realitas, dibatasi oleh mana dan meter Chaos.

Semua angka adalah nilai awal untuk di-tuning.

| Skill | Input | Efek | Mana | Cooldown | Buka di |
| --- | --- | --- | --- | --- | --- |
| Hex Bolt | LMB | Proyektil merah lurus, 12 damage, mengisi meter Chaos | 0 | 0,4 dtk | Lv 1 |
| Telekinesis Grip | Tahan RMB | Mengangkat satu musuh atau objek hingga 500 kg, lalu dilempar; damage mengikuti massa dan kecepatan | 4/dtk | tidak ada | Lv 1 |
| Chaos Burst | Q | Ledakan area radius 8 m, mendorong musuh, merusak cover | 30 | 8 dtk | Lv 3 |
| Hex Snare | E | Zona 6 m selama 6 dtk: musuh melambat 40% dan menerima +25% damage | 25 | 12 dtk | Lv 5 |
| Hex Barrier | C | Perisai 3 dtk yang menyerap 150 damage, lalu meledak dan mendorong musuh | 20 | 15 dtk | Lv 7 |
| Reality Warp | V | Medan radius 10 m selama 5 dtk: gravitasi terbalik dan proyektil musuh dipantulkan | 60 | 30 dtk | Lv 10 |

**Meter Chaos (0 sampai 100).** Naik saat kamu memberi dan menerima damage. Saat penuh, tekan G untuk Crimson Overload: 12 detik damage +50% dan semua skill tanpa biaya mana. Setelah itu datang Backlash: 3 detik tanpa regen mana dan 10% HP saat ini hilang. Ini menerjemahkan sihir Ilyra yang kuat tapi tidak stabil menjadi keputusan risiko-imbalan, bukan sekadar tombol super.

**Interaksi lingkungan.** Objek fisik (mobil, pecahan beton, peti) bisa diangkat dan dilempar; Chaos Burst merobohkan cover tipis. Untuk menjaga performa, batasi 20 objek fisik aktif sekaligus.

## Arise: Umbra Rite

Setiap musuh yang kalah bisa dibangkitkan menjadi bayangan yang bertarung untukmu, tetapi hasilnya ditentukan satu kali lemparan peluang dan jumlahnya dibatasi slot.

&#91;embedded content: alur Arise · 1 keputusan, 2 hasil\]

Satu cast per mayat: bila peluang tidak lolos, essence hilang dan tidak ada percobaan ulang.

- **Jendela:** mayat bersinar ungu selama 20 detik dalam radius 10 m dari pemain.
- **Cast:** tahan R 1,5 detik dan bayar 40 mana; cast batal bila pemain terkena damage.
- **Slot:** 3 slot di awal, ditambah 1 slot tiap 5 poin Umbra. Bila slot penuh, pemain memilih bayangan lama yang dilepas.
- **Ruang Bayangan:** bayangan disimpan di sana dan dipanggil dengan menahan Z; semuanya ikut ke Rift berikutnya.
- **Perintah (roda Z):** Ikuti, Serang target, Tahan posisi, dan Tukar Tempat (Lv 4) yang menukar posisimu dengan satu bayangan sebagai teleport taktis.
- **Pertumbuhan:** bayangan mendapat 30% dari XP yang kamu dapat dan naik level bersamamu. Bayangan yang tumbang kembali utuh di Rift berikutnya, tanpa permadeath.

Peluang berhasil dihitung dari rank musuh, selisih level, dan stat Umbra (UMB):

```latex
P = \operatorname{clamp}\big(B_{\mathrm{rank}} + 0{,}02\,(L_{\mathrm{pemain}} - L_{\mathrm{musuh}}) + 0{,}01\,\mathrm{UMB},\ 0{,}10,\ 0{,}90\big)
```

Contoh: pemain Lv 5 dengan UMB 15 melawan Ksatria Lv 6 mendapat 0,45 − 0,02 + 0,15 = 58%.

| Rank bayangan | Asal | Peran | Peluang dasar (B) |
| --- | --- | --- | --- |
| Prajurit | Husk, Rift Hound, Spitter | Pengalih perhatian, damage kecil | 60% |
| Ksatria | Warden | Garis depan, tahan damage | 45% |
| Jenderal | Rift Lord | Damage besar dan 1 skill unik | 30% |
| Marsekal | Boss Rift | Hanya satu per boss, kuat dan unik | 15% |

## Level, stat & skill tree

Level 1 ke 2 butuh 80 XP dan level 9 ke 10 butuh 2.160 XP; karena musuh memberi 10 XP per level musuh (boss 15), itu setara 8 musuh di awal dan 24 musuh di Lv 9.

&#91;embedded content: rancangan awal · Lv 1–9, XP = 80 × n^1,5 dibulatkan ke puluhan\]

Kurva ini sengaja menanjak: level awal habis dalam satu Rift, level tengah butuh beberapa Rift, sehingga pemain terdorong mencoba tier yang lebih tinggi.

**Stat.** Setiap level memberi 3 poin stat bebas dan 1 poin skill. Semua stat dimulai dari 5.

| Stat | Efek tiap poin |
| --- | --- |
| Hex (HEX) | +2% damage sihir Chaos |
| Spirit (SPR) | +5 mana maksimum dan regen mana sedikit lebih cepat |
| Vitality (VIT) | +10 HP maksimum |
| Agility (AGI) | +1% kecepatan gerak dan +0,1 dtk waktu melayang |
| Umbra (UMB) | +1% peluang Arise dan +1 slot bayangan tiap 5 poin |

**Skill tree.** Skill baru terbuka otomatis pada level yang tertera. Poin skill dipakai untuk upgrade skill yang sudah terbuka.

| Cabang | Skill | Buka di | Contoh upgrade |
| --- | --- | --- | --- |
| Chaos | Hex Bolt | Lv 1 | Menembak 3 peluru menyebar |
| Chaos | Telekinesis Grip | Lv 1 | Mengangkat 2 target sekaligus |
| Chaos | Chaos Burst | Lv 3 | Radius +2 m |
| Chaos | Hex Snare | Lv 5 | Durasi +2 dtk |
| Chaos | Hex Barrier | Lv 7 | Menyerap +50 damage |
| Chaos | Reality Warp | Lv 10 | Durasi +2 dtk |
| Umbra | Arise | Lv 2 | Waktu cast jadi 1 dtk |
| Umbra | Tukar Tempat | Lv 4 | Cooldown lebih pendek |
| Umbra | Perintah Fokus | Lv 6 | Bayangan menyerang target yang sama dengan damage +20% |
| Umbra | Kebangkitan Jenderal | Lv 8 | Bisa membangkitkan Rift Lord |
| Umbra | Kebangkitan Marsekal | Lv 9 | Bisa membangkitkan boss Rift |

## Musuh, Rift & boss

Rift dibagi dalam lima tier, dan tiap tier memperkenalkan satu jenis musuh baru yang memaksa pemain memakai skill berbeda. Versi pertama cukup mencakup Tier I sampai III.

| Tier Rift | Level musuh | Durasi | Isi |
| --- | --- | --- | --- |
| I | 1–3 | 8 menit | Husk, Rift Hound |
| II | 4–6 | 10 menit | Ditambah Spitter |
| III | 7–9 | 12 menit | Ditambah Warden, Rift Lord (mini-boss), dan boss di akhir |
| IV–V | 10+ | 12–15 menit | Kombinasi elit; di luar cakupan versi pertama |

| Musuh | Perilaku | Dijawab dengan | Rank bayangan |
| --- | --- | --- | --- |
| Husk | Berkerumun, melee, lambat | Chaos Burst, lempar objek | Prajurit |
| Rift Hound | Cepat, menerjang dari samping | Hex Bolt, Hex Snare | Prajurit |
| Spitter | Menembak dari tempat tinggi | Telekinesis (tarik jatuh), Crimson Float | Prajurit |
| Warden | Berperisai, tahan damage | Telekinesis lempar, Reality Warp | Ksatria |
| Rift Lord | Skill area dan memanggil Husk | Pasukan bayangan menekan, Hex Snare | Jenderal |

**Boss pertama: The Hollow Warden.** Pertarungan tiga fase di akhir Rift Tier III:

1. Arena terbuka; boss memanggil gelombang Husk. Pemain belajar memadukan Chaos Burst dan pasukan bayangan.
2. Lantai arena runtuh menjadi platform melayang. Pemain wajib memakai Crimson Float dan Telekinesis.
3. Boss menyerap sisa anak buahnya dan menjadi kebal, kecuali di dalam medan Reality Warp. Pemain harus mengatur waktu skill itu.

Hadiah: XP besar dan peluang dasar 15% membangkitkan sang boss sebagai Marsekal pertama (butuh skill Kebangkitan Marsekal, Lv 9).

## Core loop & ritme gameplay

Satu putaran inti adalah satu Rift: masuk, bertarung, bangkitkan, naik level, lalu masuk Rift yang lebih sulit.

&#91;embedded content: core loop · 6 langkah, berulang\]

Ritme di dalam satu Rift dirancang naik menuju puncak kekuatan pemain:

| Bagian Rift | Tujuan desain |
| --- | --- |
| Pembuka (sekitar 2 menit) | Musuh ringan; pemain mengisi meter Chaos dan membangkitkan 1–2 bayangan pertama |
| Inti (sekitar 6 menit) | Gelombang campuran Husk, Rift Hound, dan Spitter; skill dan pasukan dipakai bersamaan |
| Puncak (2–4 menit) | Mini-boss atau boss; momen terkuat pemain dengan Overload dan pasukan penuh |
| Hadiah | Layar Ledger: XP, level naik, alokasi stat, daftar bayangan baru |

## Teknologi, scope & roadmap

Pilih engine dulu, lalu kerjakan lima fase berurutan; tiap fase ditutup gerbang, dan versi pertama berhenti di satu Rift lengkap dengan boss.

| Engine | Cocok jika | Pertimbangan untuk game ini |
| --- | --- | --- |
| Unity (C#) | Kamu ingin banyak tutorial dan aset siap pakai | Cocok untuk FPS dan efek sihir lewat VFX Graph; NavMesh siap pakai untuk AI musuh dan pasukan bayangan |
| Unreal Engine 5 (Blueprint/C++) | Kamu mengejar visual sinematik | Niagara kuat untuk efek tangan dan ledakan; lebih berat untuk developer tunggal dan butuh PC kuat |
| Godot 4 (GDScript/C#) | Kamu ingin ringan, gratis, dan cepat membuat prototype | Cocok untuk gaya stylized; efek dan 3D realistis butuh kerja lebih banyak |

Untuk satu developer, Unity atau Godot lebih realistis; Unreal masuk akal bila kamu sudah nyaman dengan Blueprint dan mengejar visual tinggi.

&#91;embedded content: roadmap · 5 fase, 5 gerbang, perkiraan kasar untuk satu developer\]

Fase 1 (aksen) adalah titik mulai. Waktu adalah angka kasar untuk satu developer, total sekitar 24 minggu, dan bukan komitmen jadwal.

**Catatan IP.** Mekanik umum seperti sistem level, telekinesis, dan membangkitkan musuh biasanya tidak dilindungi hak cipta, tetapi nama, karakter, desain visual, dan istilah khas dari Marvel dan Solo Leveling dilindungi. Dokumen ini memakai nama sendiri (Chaos, Umbra Rite, Ledger, Ilyra) dan sebaiknya tetap begitu bila game dirilis; hindari kostum, logo, atau frasa yang sama persis dengan kedua sumber. Saya bukan pengacara, jadi untuk rilis komersial konsultasikan ke ahli hukum.

## Pertanyaan terbuka & langkah berikutnya

Lima keputusan dari kamu menentukan bentuk prototype pertama; sisanya sudah cukup untuk mulai.

- **Engine:** Unity, Unreal, atau Godot? Mana yang sudah kamu kuasai atau ingin pelajari?
- **Tim:** dikerjakan sendiri atau berdua/lebih? Ini menentukan seberapa besar Fase 2–4 bisa dikejar.
- **Gaya visual:** realistis gelap, atau stylized/low-poly yang lebih murah dibuat?
- **Platform:** PC saja, atau konsol/mobile juga? Mempengaruhi kontrol dan performa.
- **Arti "membangkitkan":** dokumen ini mengasumsikan membangkitkan musuh yang kalah menjadi pasukan bayangan. Kalau maksudmu juga menghidupkan kembali sekutu atau NPC, bagian Arise perlu diperluas.

Langkah berikutnya: setelah engine dipilih, Fase 1 dan 2 (gerak FPS, tangan sihir, Hex Bolt, Telekinesis, satu musuh) bisa langsung dibuatkan sebagai prototype yang dimainkan.
