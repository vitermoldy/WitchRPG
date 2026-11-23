# Crimson Sovereign

RPG aksi 3D first-person di browser. Kamu bermain sebagai Ilyra, witch terakhir dari coven yang dihancurkan Rift: tangan kirinya membengkokkan realitas dengan sihir Chaos, tangan kanannya membangkitkan musuh yang kalah menjadi pasukan bayangan.

Ini prototype Fase 1 dan 2 dari [Game Design Document](./Game%20Design%20Document%20RPG%203D%20First-Person%20Witch.md): satu Rift Tier I lengkap dengan lima gelombang. Keputusan desain dan penyesuaian dari GDD ada di [DESIGN.md](./DESIGN.md).

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

## Kontrol

| Tangan kiri, Chaos | |
| --- | --- |
| Klik kiri | Hex Bolt |
| Tahan klik kanan | Telekinesis, lepas untuk melempar |
| Q | Chaos Burst (Lv 3) |
| E | Hex Snare (Lv 5) |
| X | Hex Barrier (Lv 7) |
| G | Crimson Overload saat meter Chaos penuh |

| Tangan kanan, Umbra | |
| --- | --- |
| Tahan R | Umbra Rite pada tubuh musuh yang bersinar ungu (Lv 2) |
| Tahan Z | Roda perintah: Ikuti, Serang, Tahan, Tukar Tempat |

| Gerak | |
| --- | --- |
| WASD, Shift | Jalan, lari |
| Spasi | Lompat; tahan di udara untuk melayang |
| C | Menunduk; slide saat lari |
| F | Interaksi (keluar dari Rift) |
| Tab | Ledger |
| Esc | Jeda dan pengaturan |

## Struktur

```
src/game/     logika murni: angka tuning (balance.ts), progresi, skill, simpanan
src/engine/   dunia 3D, pemain, tangan, musuh, sihir, Umbra, Rift, suara
src/ui/       HUD dan Ledger
tests/        tes Vitest untuk progresi
```
