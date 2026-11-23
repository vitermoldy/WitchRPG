# DESIGN.md: Crimson Sovereign (versi 1)

Prototype yang bisa dimainkan dari [Game Design Document](./Game%20Design%20Document%20RPG%203D%20First-Person%20Witch.md). Dokumen ini mencatat keputusan pemilik, cara GDD diterjemahkan ke game, dan alasan tiap pilihan visual.

## Keputusan pemilik (23 Nov 2026)

| Pertanyaan GDD | Jawaban |
| --- | --- |
| Engine | Three.js di browser (Vite + TypeScript), seperti proyek lain di MyRepo |
| Gaya visual | Stylized gelap: geometri sederhana, cahaya merah dan ungu yang kuat |
| Arti "membangkitkan" | Membangkitkan musuh yang kalah menjadi pasukan bayangan (asumsi GDD, belum diubah pemilik) |
| Tim dan platform | Belum dijawab. Prototype dibuat untuk PC dengan keyboard dan mouse |

## Yang sudah bisa dimainkan

- Gerak FPS: jalan, lari, lompat, Crimson Float (tahan Spasi di udara, stamina), menunduk dan slide, head bob dan guncangan kamera yang bisa dimatikan.
- Dua tangan sihir yang selalu terlihat, digambar di pass terpisah supaya tidak menembus dinding. Tiap tangan punya pose diam, mengisi, melepas, dan Overload.
- Chaos: Hex Bolt, Telekinesis Grip (angkat musuh, peti, atau mobil sampai 500 kg lalu lempar), Chaos Burst, Hex Snare, Hex Barrier, meter Chaos dengan Crimson Overload dan Backlash.
- Umbra: Umbra Rite (tahan R di tubuh yang bersinar, satu lemparan peluang per tubuh), slot bayangan, roda perintah Z (Ikuti, Serang, Tahan, Tukar Tempat), Perintah Fokus, bayangan ikut naik level dan kembali utuh di Rift berikutnya.
- Tiga tier Rift di kota yang dikepung retakan: Tier I (Husk, Rift Hound), Tier II (ditambah Spitter yang menembak dari perancah), Tier III (ditambah Warden berperisai dan Rift Lord sebagai mini-boss).
- Jantung Rift di ujung Tier III: The Hollow Warden dalam tiga fase GDD, lantai yang runtuh menjadi pilar di atas kehampaan, Reality Warp sebagai kunci fase 3, dan epilog setelah boss pertama tumbang.
- Kebangkitan Jenderal (Rift Lord) dan Kebangkitan Marsekal (boss, satu kali), masing-masing dengan skill bayangan sendiri.
- Ledger (Tab): level, XP, 3 poin stat dan 1 poin skill per level, pohon skill dua cabang, Ruang Bayangan dengan tombol Lepas.
- Simpanan di localStorage, layar judul, jeda dengan pengaturan, hasil Rift, layar tumbang.

Di luar cakupan versi 1 menurut GDD: Rift Tier IV dan V (kombinasi elit).

## Penyesuaian dari GDD dan alasannya

| GDD | Di prototype | Alasan |
| --- | --- | --- |
| Menunduk / slide di Ctrl | C | Di browser, Ctrl+W dan Ctrl+Shift+W menutup tab. Pemain yang sedang lari (W) lalu slide akan menutup game. |
| Hex Barrier di C | X | C dipakai slide. |
| Nama skill "Arise" | "Umbra Rite", aksi "Bangkitkan" | "Arise" adalah frasa khas sumber referensi. Catatan IP di GDD meminta frasa sumber tidak dipakai persis. |
| Ruang Bayangan dipanggil dengan menahan Z | Semua bayangan bangkit otomatis di awal Rift; tahan Z membuka roda perintah | Satu tombol untuk dua fungsi tahan membuat salah pencet. Memanggil semua di awal juga menjaga tempo pembuka. |
| Perintah "Serang target" dan Perintah Fokus (Lv 6) | Sebelum Lv 6, Serang mengirim tiap bayangan ke musuh terdekat dari titik bidik. Setelah Lv 6, semua memukul satu target; upgradenya +20% damage | Memberi Perintah Fokus perbedaan yang terasa. |
| Efek stat per poin | Dihitung dari poin di atas nilai awal 5, kecuali UMB di rumus Umbra Rite | Witch baru bermain di nilai dasar GDD. Rumus peluang memakai UMB mentah supaya contoh GDD (58%) tetap tepat, dan itu dikunci tes. |
| Slot bayangan "3 di awal, +1 tiap 5 poin Umbra" | 3 + floor((UMB − 5) / 5) | UMB awal 5 memberi tepat 3 slot. |
| Rift Tier I sekitar 8 menit | Bot uji menyelesaikannya dalam sekitar 3 menit waktu game | Bot membidik sempurna. Pemain manusia diperkirakan 4 sampai 6 menit. Jumlah gelombang ada di `TIERS` di `balance.ts`. |

## Angka tuning yang berubah setelah playtest bot

Semua di `src/game/balance.ts`.

- Husk: damage 8 → 10, kecepatan 2,4 → 3,1 m/dtk. Rift Hound: damage 9 → 12, cooldown terjang 2,2 → 1,8 dtk. Jeda spawn 0,9 → 0,8 dtk. Dengan angka awal, bot yang membidik sempurna tidak pernah terkena serangan sepanjang satu Rift.
- Jeda antar gelombang memulihkan 20% HP maksimum. GDD belum punya cara menyembuhkan diri, dan bot yang membidik meleset tumbang di gelombang 5 tanpanya.
- Bayangan: HP ×1,5 → ×2,2 dari musuh asalnya, dan pulih 4% HP per detik saat tidak bertarung. Sebelumnya ketiga bayangan tumbang di gelombang 3, sehingga fantasi "pasukan" hilang di tengah Rift.

## Versi 1: Tier II, Tier III, dan The Hollow Warden (23 Nov 2026)

Pemilik meminta "lanjut sampai gamenya jadi". Jadi di sini berarti versi pertama menurut GDD: Tier I sampai III dan satu Rift lengkap dengan boss.

| Bagian | Keputusan | Alasan |
| --- | --- | --- |
| Kunci tier | Tier II terbuka di Lv 4, Tier III di Lv 7 | GDD memberi level musuh per tier (1 sampai 3, 4 sampai 6, 7 sampai 9) tanpa syarat masuk; kuncinya mengikuti level musuh itu. |
| Gerbang Jantung Rift | Terbuka di akhir Tier III hanya untuk witch Lv 10 | Fase 3 boss hanya bisa dilukai di dalam Reality Warp, dan GDD membuka Reality Warp di Lv 10. Tanpa syarat ini fase 3 tidak bisa dimenangkan. Witch di bawah Lv 10 keluar biasa dan diberi tahu syaratnya. |
| Spitter | Muncul di atas perancah setinggi 4 sampai 5 m dan menembak gumpalan berbusur | GDD: "menembak dari tempat tinggi", dijawab dengan Telekinesis (tarik jatuh) dan Crimson Float. |
| Warden | Perisai menahan 85% damage dari depan; lemparan Telekinesis menembus dan membuatnya limbung 2 detik | GDD: dijawab dengan Telekinesis lempar dan Reality Warp. |
| Rift Lord | Menghantam tanah dengan lingkaran peringatan amber, memanggil 3 husk setiap 14 detik, terlalu berat untuk diangkat | GDD: skill area dan memanggil Husk. |
| Boss fase 1 | Hantaman (lingkaran 5 m, ancang-ancang 1,3 detik) dan gelombang 6 husk | Lingkaran harus muat di atas pilar supaya bisa dihindari. |
| Boss fase 2 | Peringatan 3 detik, lantai jatuh, boss melayang dengan cangkang: bolt hanya 10%, benda yang dilempar 150%. Tiga batu selalu tersedia di pilar terdekat | GDD: wajib Crimson Float dan Telekinesis. Batu yang meleset ke sisi jauh tidak dihitung, supaya fase ini tidak macet. |
| Boss fase 3 | Menelan sisa anak buahnya, kebal kecuali di dalam Reality Warp. Di dalam medan ia limbung dan menerima +50% damage | Dengan cooldown Warp 30 detik dari GDD, jendela 5 sampai 7 detik terlalu pendek tanpa bonus ini; bot uji kehabisan HP sebelum boss jatuh. |
| Napas antar fase | Setiap fase baru memulihkan 25% HP dan 30 mana | Pertarungan boss tidak punya jeda gelombang. |
| Lemparan Telekinesis | Terbang hampir lurus selama 0,9 detik menuju titik bidik | Dengan gravitasi penuh, batu jatuh sekitar 5 m sebelum mencapai boss yang melayang 20 m jauhnya. |
| XP per rank | Prajurit ×1, Ksatria ×2, Jenderal ×5, Marsekal ×10 (boss Lv 10 = 1.500 XP) | GDD: "Hadiah: XP besar". Rumus 10 XP per level musuh tetap dipakai sebagai dasar. |
| Pertumbuhan | Musuh +15% HP dan +10% damage per level (sebelumnya +25% dan +15%); witch +5% damage dan +8 HP per level | Tanpa ini husk Lv 9 butuh tiga kali lebih banyak bolt dari husk Lv 1 sementara witch tidak bertambah kuat. Dikunci tes. |
| Upgrade Hex Bolt | 3 peluru × 6 damage (sebelumnya × 9) | Versi lama hampir melipattigakan DPS dan menghabisi fase 1 boss dalam 8 detik. |
| Kebangkitan Jenderal dan Marsekal | Rift Lord bayangan memanggil dua husk bayangan sementara; Hollow Warden bayangan menarik dan membekukan musuh. Satu Marsekal per boss, tanpa upgrade | GDD: Jenderal punya 1 skill unik, Marsekal hanya satu per boss. GDD tidak memberi upgrade untuk keduanya. |

Hasil bot uji (`?debug`, waktu game): Tier II dari Lv 4 berakhir di Lv 8 sebelum jumlah musuhnya dikurangi sekitar 25%, supaya level tengah butuh lebih dari satu Rift seperti di GDD. Tier III dari Lv 7 sampai Lv 10 dalam satu Rift, dan gerbang Jantung Rift terbuka. Bot boss yang hanya membidik, menghindari lingkaran hantaman, dan bergeser di atas pilar menang dalam sekitar 2,5 menit dengan 80 HP tersisa.

## Terbang, dunia terbuka, dan pasukan tanpa batas (23 Nov 2026)

Pemilik meminta: witch bisa terbang, ada mode dunia terbuka, bayangan bisa dibangkitkan sebanyak-banyaknya, satu tombol untuk memanggil dan mengembalikan pasukan, dan efek pemanggilan yang terasa seperti pasukan bayangan bangkit dari tanah. Efeknya dibuat sendiri; tidak ada nama, kalimat, atau aset dari karya sumber.

| Bagian | Keputusan | Alasan |
| --- | --- | --- |
| Terbang | Ketuk Spasi dua kali (jeda 0,32 detik) untuk mulai dan berhenti. Spasi naik 8 m/dtk, C turun, Shift mempercepat dari 13 ke 26 m/dtk. C di dekat tanah mendarat | Spasi sekali tetap lompat dan tahan Spasi tetap Crimson Float, jadi kontrol lama tidak berubah. |
| Biaya terbang | Gratis di dunia terbuka. Di dalam Rift memakai stamina (6 per detik, 12 saat cepat) dan berhenti saat stamina habis. Plafon 90 m di dunia, 22 m di kota Rift, 30 m di Jantung Rift | Di dunia terbuka terbang adalah cara berkeliling. Di Rift, terbang bebas akan membuat musuh darat dan fase 2 boss tidak berarti. |
| Dunia terbuka | Kota 500 × 500 m, jalan setiap 80 m, gedung instanced. Altar di alun-alun menyembuhkan 12% HP dan mana per detik dan menjadi tempat bangkit. Jauh dari altar, HP pulih 3% per detik setelah 6 detik tanpa terkena serangan | Kota yang sama dengan Rift, diperluas, supaya dunia terasa satu. Tanpa pemulihan, pemain harus terbang bolak-balik ke altar setelah setiap kamp. |
| Kamp | 19 kamp. Semakin jauh dari pusat, semakin tinggi levelnya: Lv 1 sampai 3, 4 sampai 6, 7 sampai 9. Dua kamp elite membawa Rift Lord. Kamp bangun saat witch berjarak 80 m, tidur lagi kalau ditinggal lebih dari 170 m, dan hidup kembali 120 detik setelah ditaklukkan | Mengikuti pita level Tier I sampai III dari GDD. Kompas memberi warna titik kamp: merah kalau levelnya di atas witch, amber kalau setara, abu-abu kalau mudah. |
| Gerbang Rift | Tiga gerbang (Tier I, II, III) memakai kunci level yang sama dengan layar judul. F membuka Rift arena yang sudah ada. Setelah Rift selesai, tumbang, atau ditinggalkan, ada tombol "Kembali ke dunia terbuka" yang menaruh witch di depan gerbang itu, dengan kamp yang sudah ditaklukkan tetap padam | Rift dan boss tetap menjadi tujuan besar; dunia terbuka menjadi jalan menuju ke sana. |
| Tumbang di dunia | "Bangkit di altar": HP dan mana penuh, XP dan bayangan tetap, kamp yang sudah ditaklukkan tetap padam | Tidak ada gelombang yang perlu diulang, jadi hukuman tumbang hanya jarak ke tempat terakhir. |
| Ruang Bayangan | Tidak ada batas slot (batas teknis 2.000). UMB tidak lagi menambah slot; setiap poin UMB di atas 5 membuat semua bayangan 2% lebih kuat (HP dan damage) | Permintaan "sebanyak-banyaknya". UMB tetap berguna setelah slot hilang. |
| Bangkitkan banyak | Kalau ada dua atau lebih tubuh bersinar dalam 12 m, tahan R membangkitkan semuanya dalam satu rapalan. Mana 40, ditambah 8 per tubuh tambahan. Setiap tubuh tetap memakai peluangnya sendiri | Satu tombol untuk satu tumpukan musuh, tapi peluang GDD tidak dilewati. |
| T: panggil dan kembalikan | T memanggil bayangan dari Ruang Bayangan (Marsekal dulu, lalu Jenderal, Ksatria, Prajurit, level tertinggi dulu). T lagi mengembalikan semuanya. Jeda 2,5 detik. Masuk Rift tidak lagi memanggil pasukan otomatis | Pemain memilih kapan pasukan keluar. Bayangan yang tumbang terbentuk kembali setelah 45 detik dan bisa dipanggil lagi. |
| Batas di medan | Pengaturan "Bayangan di medan" di layar jeda, 10 sampai 120, bawaan 50. Bayangan yang baru dibangkitkan langsung bergabung kalau masih ada tempat, kalau tidak masuk ke Ruang Bayangan | Diukur di GPU nyata dengan 20 musuh: waktu frame median 8 ms untuk 20 bayangan, 10 ms untuk 40, 14 ms untuk 60, 19 ms untuk 80, 26 ms untuk 120. 50 masih di bawah 16 ms. Bayangan pasukan tidak memberi bayangan cahaya, supaya angkanya tetap segini. |
| Efek pemanggilan | Kolam hitam-ungu meluber dari bawah kaki Ilyra. Satu kolam terbuka di tiap tempat berdiri prajurit, prajurit naik dari kolam itu satu per satu, dan mata mereka menyala paling akhir. Tepi layar menggelap ungu sesaat. Saat dikembalikan, urutannya terbalik: kolam terbuka, prajurit tenggelam, kolam menutup | Bahasa visual Umbra yang sudah ada (ungu, asap gelap, mata bercahaya), dibuat lebih besar untuk momen pasukan. |
| Formasi | Lingkaran di belakang witch: 8 di lingkaran pertama, bertambah 4 per lingkaran, jarak antarlingkaran 1,8 m | Lima puluh bayangan dalam satu baris akan memanjang ratusan meter. |
| Bayangan tertinggal | Di dunia terbuka, bayangan yang tertinggal lebih dari 45 m (misalnya karena witch terbang) tenggelam dan muncul lagi di sampingnya, kecuali yang diperintah Tahan | Pasukan darat tidak bisa mengikuti witch yang terbang. |
| HUD pasukan | Panel kanan bawah menjadi ringkasan: jumlah di medan dari batasnya, isi Ruang Bayangan, yang sedang terbentuk kembali, tiga bayangan terkuat dengan HP, lalu "dan N lainnya" | Panel per slot tidak muat untuk ratusan bayangan. |
| Ledger | Ruang Bayangan dikelompokkan per rank dan jenis, terkuat di atas. Kelompok dibuka untuk melihat anggotanya (60 teratas) dan melepas satu per satu | Ratusan kartu sejajar tidak terbaca. |
| Server | Batas bayangan 40 menjadi 2.000, batas body JSON 64 KB menjadi 1 MB, kolom `shadows.slot` dan `rift_runs.shadows_raised` menjadi SMALLINT. Migrasi otomatis saat server menyala | Ruang Bayangan penuh sekitar 200 KB JSON. |

## Arah desain

Reading this as: game aksi first-person untuk pemain PC, bahasa visual noir-sinematik dengan sihir dua warna, dial ENERGY 3 / RHYTHM 2 / MOTION 3.

| Keputusan | Alasan |
| --- | --- |
| Merah Chaos `#ff2a3d` di kiri, ungu Umbra `#8f55ff` di kanan | Datang dari GDD: warna adalah identitas tiap tangan. HUD mengulang pembagian itu: kondisi witch di kiri bawah, pasukan bayangan di kanan bawah, pohon skill Chaos di kolom kiri dan Umbra di kanan. Ini motif identitas seluruh UI. |
| Makhluk Rift bermata dan beretakan amber `#ffa53d` | Musuh tidak boleh terbaca sebagai merah witch atau ungu bayangan. Amber juga dipakai untuk angka musuh dan level, satu-satunya aksen ketiga. |
| Tema gelap tanpa toggle terang | Nada GDD "gelap dan sinematik", dan HUD duduk di atas adegan 3D yang gelap. Mode terang tidak punya arti di dalam Rift. |
| Sora untuk judul, Figtree untuk teks, Martian Mono untuk angka | Pasangan pertama dari `start.mjs deal --page gaming --trade game` (taste-skill). Sora lebar dan geometris, cocok untuk kota modern-fantasi. Martian Mono dipakai hanya untuk angka (HP, XP, peluang) supaya tidak bergeser saat berubah. |
| Tangan bersarung gelap dengan sigil bercahaya | Tangan pucat terlihat seperti kertas datar di adegan gelap. Sarung gelap membuat sigil dan cahaya telapak membawa warnanya, dan siluet jari tetap terbaca. |
| Glow hanya di sihir, sigil, retakan, dan tombol Overload saat siap | Bloom adalah bahasa sihir di game ini. Panel HUD tetap datar supaya glow tetap berarti "ada kekuatan di sini". |
| HUD di tepi layar, panel semi-transparan, radius 4 px | Tengah layar milik tangan dan pertarungan (pilar 1 GDD). Radius kecil menjaga kesan tegas, tidak ada bentuk pil. |
| Pesan Ledger di kiri tengah, diberi label kecil "Ledger" | GDD menyebut identitas witch dibawa lewat pesan Ledger. Label memberi suara itu tanpa jendela sistem bergaya game sumber. |
| Semua suara disintesis dengan WebAudio | Tidak ada file audio berlisensi yang perlu dicari. |
| Favicon dua lingkaran merah dan ungu | Penanda sementara, bukan logo. Logo dan ikon menunggu arahan pemilik. |

Motion: bob tangan, recoil saat cast, guncangan kamera, banner gelombang, dan feed yang memudar. Semua animasi CSS berhenti di `prefers-reduced-motion`; head bob dan guncangan kamera punya tombol sendiri di layar jeda.

## Database dan akun (23 Nov 2026)

Pemilik meminta database "seperti yang lain" dengan akun pemilik `vmk`. Bentuknya sama dengan proyek database lain di MyRepo:

- Express 5 + mysql2 di port 8813 (port Vite 5197 + 3616), database `witch_rpg`. Akun MySQL di `.env` disalin dari SongPlaylist-ForLearning dan tidak ikut ke git.
- Tabel `users` dan `sessions` dari modul auth bersama (scrypt, cookie HttpOnly `witch_rpg_session`, masuk dibatasi 10 kali per menit, kata sandi minimal 6 karakter).
- Tabel game: `clients` (satu kode data per akun), `witches` (level, XP, poin, lima stat, pengaturan), `witch_upgrades`, `shadows` (Ruang Bayangan), `rift_runs` (setiap Rift yang ditutup, tumbang, atau ditinggalkan).
- Browser menyimpan lebih dulu, lalu witch dikirim ke server sedetik kemudian. Saat masuk, salinan yang `updatedAt`-nya lebih baru yang dipakai; witch yang belum pernah dimainkan selalu kalah dari salinan server.
- Saat server menyala, layar masuk menutup layar judul dan tidak bisa ditutup dengan Esc. Saat server mati, layar itu menawarkan "Coba lagi" dan "Main tanpa akun".
- Keluar akun mengirim witch dan Rift yang tertunda dulu, lalu menghapusnya dari browser.
- Riwayat Rift tampil sebagai bagian baru di Ledger.

## Cara mengecek

- `npm test`: kurva XP (80 dan 2.160), peluang Umbra Rite (contoh GDD 58%), slot, upgrade, bagi XP bayangan, damage lempar.
- `npm run dev` lalu buka `http://localhost:5197/?debug` untuk uji otomatis: `window.__game` terbuka, pointer lock tidak dibutuhkan, dan `__game.debugSpeed = 3` mempercepat pertarungan.
