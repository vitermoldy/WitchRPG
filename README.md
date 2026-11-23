# Crimson Sovereign

RPG aksi 3D first-person di browser. Kamu bermain sebagai Ilyra, witch terakhir dari coven yang dihancurkan Rift: tangan kirinya membengkokkan realitas dengan sihir Chaos, tangan kanannya membangkitkan musuh yang kalah menjadi pasukan bayangan.

Ini prototype Fase 1 dan 2 dari [Game Design Document](./Game%20Design%20Document%20RPG%203D%20First-Person%20Witch.md): satu Rift Tier I lengkap dengan lima gelombang. Keputusan desain dan penyesuaian dari GDD ada di [DESIGN.md](./DESIGN.md).

## Menjalankan

Butuh Node 22 atau lebih baru dan browser dengan WebGL 2.

```bash
npm install
npm run dev      # http://localhost:5197
npm test         # tes progresi dan rumus
npm run build    # hasil di dist/, bisa dibuka dari host statis mana pun
```

## Kontrol

| Tangan kiri, Chaos | |
| --- | --- |
| Klik kiri | Hex Bolt |
| Tahan klik kanan | Telekinesis, lepas untuk melempar |
| Q | Chaos Burst (Lv 3) |
| E | Hex Snare (Lv 5) |
| X | Hex Barrier (Lv 7) |
