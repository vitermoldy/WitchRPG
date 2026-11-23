# Crimson Sovereign

RPG aksi 3D first-person di browser. Kamu bermain sebagai Ilyra, witch terakhir dari coven yang dihancurkan Rift: tangan kirinya membengkokkan realitas dengan sihir Chaos, tangan kanannya membangkitkan musuh yang kalah menjadi pasukan bayangan.

Game ini mengikuti [Game Design Document](./Game%20Design%20Document%20RPG%203D%20First-Person%20Witch.md): Rift Tier I sampai III di kota yang dikepung retakan, lalu Jantung Rift dan bossnya, The Hollow Warden, dalam tiga fase. Setelah boss kalah, Rift Tier IV dan V terbuka dengan musuh Lv 10 ke atas dan makhluk elite. Keputusan desain dan penyesuaian dari GDD ada di [DESIGN.md](./DESIGN.md).

| Rift | Terbuka | Isi |
| --- | --- | --- |
| Tier I | Lv 1 | Husk dan Rift Hound, lima gelombang |
| Tier II | Lv 4 | Ditambah Spitter yang menembak dari perancah |
| Tier III | Lv 7 | Ditambah Warden berperisai dan Rift Lord; di ujungnya Jantung Rift (Lv 10) |
| Tier IV | Lv 10, setelah boss kalah | Ditambah Harrier yang terbang dan menukik, dan makhluk elite dengan satu sifat |
| Tier V | Lv 13, setelah boss kalah | Ditambah Bombard yang menembak ke lingkaran amber; di ujungnya dua Rift Lord elite |

Selain masuk Rift langsung dari layar judul, ada **dunia terbuka**: kota 500 × 500 m untuk dijelajahi sambil terbang, dengan 19 kamp makhluk Rift yang levelnya naik makin jauh dari pusat, altar penyembuh di alun-alun, dan tiga gerbang ke Rift Tier I sampai III. Bayangan bisa dibangkitkan tanpa batas; T memanggil pasukan dari Ruang Bayangan dan mengembalikannya lagi.

## Menjalankan

Butuh Node 22 atau lebih baru, browser dengan WebGL 2, dan MySQL 8 untuk akun.

```bash
npm install
cp .env.example .env   # isi DB_PASSWORD MySQL
npm run server         # API + MySQL di port 8813; database witch_rpg dan tabelnya dibuat sendiri
npm run dev            # http://localhost:5197, /api diteruskan ke server
npm test               # tes progresi, rumus, dan gerak witch
npm run build          # hasil di dist/; npm start menyajikannya bersama API
```

## Akun dan database

Selama server menyala, game dibuka dengan masuk akun (username dan kata sandi). Level, stat, upgrade skill, Ruang Bayangan, pengaturan, dan riwayat Rift tersimpan di MySQL, jadi witch bisa dilanjutkan dari browser lain. Kalau server mati, game tetap jalan lewat "Main tanpa akun": witch tersimpan di browser, Rift yang selesai menunggu dan terkirim begitu kamu masuk.

```bash
npm run users                              # daftar akun, level, bayangan, Rift
npm run set-user -- <username> <kata sandi> # buat akun atau ganti kata sandinya
```

Akun pemilik: `vmk`.

## Kontrol

| Tangan kiri, Chaos | |
| --- | --- |
| Klik kiri | Hex Bolt |
| Tahan klik kanan | Telekinesis, lepas untuk melempar |
| Q | Chaos Burst (Lv 3) |
| E | Hex Snare (Lv 5) |
| X | Hex Barrier (Lv 7) |
| V | Reality Warp (Lv 10) |
| G | Crimson Overload saat meter Chaos penuh |

| Tangan kanan, Umbra | |
| --- | --- |
| Tahan R | Umbra Rite pada tubuh musuh yang bersinar ungu (Lv 2); dua tubuh atau lebih dalam 12 m dibangkitkan sekaligus |
| T | Panggil pasukan bayangan, tekan lagi untuk mengembalikannya |
| Tahan Z | Roda perintah: Ikuti, Serang, Tahan, Tukar Tempat |

| Gerak | |
| --- | --- |
| WASD, Shift | Jalan, lari |
| Spasi | Lompat; tahan di udara untuk melayang |
| Spasi dua kali | Terbang: Spasi naik, C turun, Shift lebih cepat. Gratis di dunia terbuka, memakai stamina di Rift |
| C | Menunduk; slide saat lari |
| F | Interaksi: masuk gerbang Rift, keluar dari Rift |
| Tab | Ledger |
| Esc | Jeda dan pengaturan, termasuk batas bayangan di medan (bawaan 50) |

## Struktur

```
src/game/     logika murni: angka tuning (balance.ts), progresi, skill, simpanan
src/engine/   dunia 3D, dunia terbuka (openworld.ts, worldmode.ts), Jantung Rift (lair.ts), pemain, tangan, makhluk, sihir, proyektil, Umbra, Rift, boss, suara
src/ui/       HUD, Ledger, layar masuk akun
src/data/     panggilan ke API: akun, witch, riwayat Rift
server/       Express + MySQL: akun (auth.js), tabel (db.js), API (app.js), perintah users dan set-user
tests/        tes Vitest untuk progresi dan gerak witch
```
