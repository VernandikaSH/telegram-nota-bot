# Telegram Nota Bot

Bot Telegram pencatat struk otomatis. Cukup **foto struk** → dibaca AI (Gemini) →
**konfirmasi di chat** → tersimpan rapi ke **Google Sheets** & database.

Tidak perlu lagi mencatat pengeluaran manual — semua terjadi dalam satu percakapan
Telegram, dan hasilnya langsung bisa dibuka sebagai spreadsheet.

**Cara kerja singkat:**

```
User kirim foto struk ke bot
        ↓
Gemini Vision — ekstrak merchant, tanggal, item, total
        ↓
Bot balas preview + tombol [Simpan] / [Batal]
        ↓
User tekan Simpan
        ↓
Supabase (database) + Google Sheets (append baris baru)
```

---

## Fitur

- **OCR struk berbasis AI** — Gemini membaca foto struk dan mengubahnya jadi data
  terstruktur (JSON), bukan sekadar teks mentah
- **Konfirmasi sebelum simpan** — hasil ekstraksi ditampilkan dulu di chat dengan
  tombol inline Simpan / Batal, jadi data salah tidak langsung masuk
- **Dual storage** — tersimpan ke Supabase (query-able) sekaligus Google Sheets
  (mudah dilihat & dibagikan)
- **Auto header Sheets** — kolom spreadsheet dibuat otomatis lewat `ensureHeader()`
- **Dual mode** — polling saat development lokal (tanpa domain publik), webhook
  saat production. Deteksi otomatis dari ada/tidaknya `WEBHOOK_URL`

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Runtime | Node.js |
| Bot | Telegram Bot API (polling & webhook) |
| AI / OCR | Google Gemini (Vision) |
| Database | Supabase (PostgreSQL) |
| Spreadsheet | Google Sheets API (service account) |
| Hosting | Render (free tier) |
| Config | `dotenv` |

**Struktur project:**

```
telegram-nota-bot/
├── src/
│   ├── index.js                 → entry point + setup webhook/polling
│   ├── ai/extractReceipt.js     → kirim gambar ke Gemini, parse jadi JSON
│   ├── db/supabaseClient.js     → koneksi & query Supabase
│   ├── sheets/appendToSheet.js  → append data ke Google Sheets
│   └── handlers/
│       ├── photoHandler.js      → saat foto struk diterima
│       └── callbackHandler.js   → saat tombol Simpan/Batal ditekan
├── package.json
├── .env.example
└── .gitignore
```

---

## Langkah Pengerjaan (Ringkas)

**1. Install dependency**
```bash
npm install
```

**2. Setup kredensial**
```bash
cp .env.example .env
```
Isi tiap variabel:

| Variabel | Sumber |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `GEMINI_API_KEY` | Google AI Studio |
| `SUPABASE_URL` / `SUPABASE_KEY` | Supabase → Project Settings → API (**service_role key**) |
| `GOOGLE_SHEETS_CLIENT_EMAIL` / `GOOGLE_SHEETS_PRIVATE_KEY` | file JSON service account |
| `SPREADSHEET_ID` | dari URL Google Sheets tujuan |
| `WEBHOOK_URL` | **kosongkan saat lokal** → bot otomatis pakai polling |

**3. (Opsional) Buat header Google Sheets — sekali saja**
```bash
node -e "require('dotenv').config(); require('./src/sheets/appendToSheet').ensureHeader().then(() => console.log('Header dibuat')).catch(console.error)"
```

**4. Jalankan lokal (mode polling)**
```bash
npm start
```
Buka Telegram → chat bot → `/start` → kirim foto struk. Tidak butuh domain publik
karena bot "menjemput" update lewat polling.

**5. Deploy ke Render (mode webhook)**
1. Push ke GitHub (pastikan `.env` **tidak ikut ter-commit** — sudah ada di `.gitignore`)
2. Render → **New → Web Service** → hubungkan ke repo
3. Setting: Build Command `npm install`, Start Command `npm start`, Environment `Node`
4. Tab **Environment** → masukkan semua variabel dari `.env`, termasuk `WEBHOOK_URL`
   (isi setelah deploy pertama berhasil, tanpa trailing slash):
```
   WEBHOOK_URL=https://telegram-nota-bot.onrender.com
```
5. Deploy → bot otomatis mendaftarkan webhook ke Telegram saat server start
6. Cek log Render — harus muncul `Bot berjalan dalam mode WEBHOOK`
7. Test kirim foto struk dari Telegram

---

## Catatan

- **Format `GOOGLE_SHEETS_PRIVATE_KEY`:** di `.env`, private key harus **satu baris**
  dengan `\n` literal (bukan newline asli). Kode sudah otomatis mengonversinya jadi
  newline sungguhan saat runtime, jadi tinggal copy-paste value `private_key` dari JSON
  apa adanya (termasuk tanda kutip luar):
```
  GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```
- **Spreadsheet wajib di-share** ke email service account (`client_email`) dengan akses
  **Editor** — kalau tidak, akan muncul `permission denied` saat simpan.
- **Cold start Render free tier:** service "tidur" setelah idle, dan butuh beberapa detik
  untuk bangun saat menerima webhook pertama. Ini normal — request berikutnya cepat.
- **Kualitas foto menentukan hasil.** Struk buram / miring / terpotong sering bikin Gemini
  gagal parse JSON. Foto tegak lurus dengan pencahayaan cukup.
- **Debugging bot diam total:** biasanya token salah atau webhook lama masih terdaftar.
  Jalankan mode polling dulu (kosongkan `WEBHOOK_URL`) untuk mengisolasi masalah.
- **Error `relation does not exist`** → tabel `transactions` belum dibuat di Supabase.
  Jalankan ulang SQL schema di SQL Editor.

---

## Saran Pengembangan

- **Edit sebelum simpan** — sekarang hanya bisa Simpan / Batal. Tambahkan tombol edit
  agar user bisa mengoreksi total atau nama merchant yang salah baca tanpa foto ulang.
- **Kategorisasi otomatis** — minta Gemini sekalian mengklasifikasikan struk
  (makanan / transport / belanja), lalu tampilkan rekap bulanan lewat command `/rekap`.
- **Retry & fallback parse** — kalau JSON dari Gemini gagal di-parse, coba ulang sekali
  dengan prompt yang lebih ketat sebelum menyerah ke user.
- **Deteksi duplikat** — cegah struk yang sama ter-input dua kali (cek hash gambar atau
  kombinasi merchant + tanggal + total).
- **Multi-user** — saat ini asumsinya satu user/satu sheet. Bisa dikembangkan agar tiap
  `chat_id` punya spreadsheet & tabel sendiri.
- **Anti cold-start** — pakai cron job (mis. UptimeRobot / cron-job.org) untuk ping
  service tiap ~10 menit agar Render tidak tidur.
- **Export & laporan** — command untuk mengunduh rekap bulanan sebagai CSV/PDF.