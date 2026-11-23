# DESIGN.md: Crimson Sovereign (prototype Fase 1 dan 2)

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
- Rift Tier I: kota yang dikepung retakan, lima gelombang Husk dan Rift Hound dari empat retakan, lalu retakan keluar di depan monumen.
- Ledger (Tab): level, XP, 3 poin stat dan 1 poin skill per level, pohon skill dua cabang, Ruang Bayangan dengan tombol Lepas.
- Simpanan di localStorage, layar judul, jeda dengan pengaturan, hasil Rift, layar tumbang.

Belum dibuat (ditandai "Belum ada di prototype ini" di Ledger): Reality Warp, Kebangkitan Jenderal, Kebangkitan Marsekal, Spitter, Warden, Rift Lord, boss The Hollow Warden, Rift Tier II dan III.

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
| Rift Tier I sekitar 8 menit | Bot uji menyelesaikannya dalam sekitar 3 menit waktu game | Bot membidik sempurna. Pemain manusia diperkirakan 4 sampai 6 menit. Jumlah gelombang bisa ditambah di `RIFT_TIER_1`. |

## Angka tuning yang berubah setelah playtest bot

Semua di `src/game/balance.ts`.

- Husk: damage 8 → 10, kecepatan 2,4 → 3,1 m/dtk. Rift Hound: damage 9 → 12, cooldown terjang 2,2 → 1,8 dtk. Jeda spawn 0,9 → 0,8 dtk. Dengan angka awal, bot yang membidik sempurna tidak pernah terkena serangan sepanjang satu Rift.
- Jeda antar gelombang memulihkan 20% HP maksimum. GDD belum punya cara menyembuhkan diri, dan bot yang membidik meleset tumbang di gelombang 5 tanpanya.
- Bayangan: HP ×1,5 → ×2,2 dari musuh asalnya, dan pulih 4% HP per detik saat tidak bertarung. Sebelumnya ketiga bayangan tumbang di gelombang 3, sehingga fantasi "pasukan" hilang di tengah Rift.

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
## Cara mengecek

- `npm test`: kurva XP (80 dan 2.160), peluang Umbra Rite (contoh GDD 58%), slot, upgrade, bagi XP bayangan, damage lempar.
- `npm run dev` lalu buka `http://localhost:5197/?debug` untuk uji otomatis: `window.__game` terbuka, pointer lock tidak dibutuhkan, dan `__game.debugSpeed = 3` mempercepat pertarungan.
