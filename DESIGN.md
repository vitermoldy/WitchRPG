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
