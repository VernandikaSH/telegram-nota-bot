# Telegram Nota Bot

Bot Telegram pencatat struk otomatis: foto struk → dibaca AI (Gemini) → konfirmasi di chat → tersimpan ke Google Sheets.

## 1. Install dependency

```bash
npm install
```

## 2. Setup kredensial

Salin `.env.example` menjadi `.env`, lalu isi semua value:

```bash
cp .env.example .env
```

Isi tiap variabel:
- `TELEGRAM_BOT_TOKEN` — dari @BotFather
- `GEMINI_API_KEY` — dari Google AI Studio
- `SUPABASE_URL` & `SUPABASE_KEY` — dari Project Settings → API di Supabase (pakai **service_role key**)
- `GOOGLE_SHEETS_CLIENT_EMAIL` & `GOOGLE_SHEETS_PRIVATE_KEY` — dari file JSON service account
- `SPREADSHEET_ID` — dari URL Google Sheets tujuan
- `WEBHOOK_URL` — **kosongkan saat testing lokal** (bot otomatis pakai mode polling)

> **Catatan penting soal `GOOGLE_SHEETS_PRIVATE_KEY`:** di file `.env`, private key harus dalam satu baris dengan `\n` literal (bukan newline asli). Kode sudah otomatis mengubah `\n` jadi newline sungguhan saat runtime, jadi kamu tinggal copy-paste value `private_key` dari JSON apa adanya (termasuk tanda kutip di luar), contoh:
> ```
> GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
> ```

## 3. (Opsional) Buat header di Google Sheets

Jalankan sekali lewat Node REPL atau script kecil untuk menulis header kolom:

```bash
node -e "require('dotenv').config(); require('./src/sheets/appendToSheet').ensureHeader().then(() => console.log('Header dibuat')).catch(console.error)"
```

## 4. Jalankan lokal (mode polling)

```bash
npm start
```

Buka Telegram, chat bot kamu, kirim `/start`, lalu kirim foto struk. Tidak perlu domain publik untuk testing ini karena bot "menjemput" update lewat polling.

## 5. Deploy ke Render (mode webhook)

1. Push project ini ke GitHub (pastikan `.env` **tidak ikut ter-commit** — sudah ada di `.gitignore`).
2. Di Render: **New → Web Service** → hubungkan ke repo GitHub kamu.
3. Setting:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Di tab **Environment**, masukkan semua variabel yang ada di `.env` (satu per satu), termasuk `WEBHOOK_URL` — isi dengan URL Render kamu setelah deploy pertama berhasil, contoh:
   ```
   WEBHOOK_URL=https://telegram-nota-bot.onrender.com
   ```
   (tanpa trailing slash)
5. Deploy. Setelah service hidup, bot otomatis mendaftarkan webhook ke Telegram saat server start (lihat `src/index.js`).
6. Cek log Render — harus muncul `Bot berjalan dalam mode WEBHOOK`.
7. Test kirim foto struk langsung ke bot dari Telegram.

> Catatan Render free tier: service akan "sleep" setelah idle beberapa saat, dan butuh beberapa detik untuk bangun lagi saat menerima request pertama (termasuk webhook dari Telegram). Ini normal untuk tier gratis — cukup tunggu beberapa detik jika respons awal terasa lambat.

## 6. Struktur Project

```
telegram-nota-bot/
├── src/
│   ├── index.js                 → entry point server + setup webhook/polling
│   ├── ai/extractReceipt.js     → kirim gambar ke Gemini, parse hasil jadi JSON
│   ├── db/supabaseClient.js     → koneksi & query ke Supabase
│   ├── sheets/appendToSheet.js  → kirim data ke Google Sheets
│   └── handlers/
│       ├── photoHandler.js      → logika saat foto struk diterima
│       └── callbackHandler.js   → logika saat tombol Simpan/Batal ditekan
├── package.json
├── .env.example
└── .gitignore
```

## 7. Troubleshooting umum

| Gejala | Kemungkinan penyebab |
|---|---|
| Bot tidak merespons sama sekali | Token salah, atau webhook lama masih aktif — coba jalankan mode polling dulu untuk isolasi masalah |
| Error saat simpan ke Sheets: permission denied | Spreadsheet belum di-share ke email service account (`client_email`) dengan akses Editor |
| Error parse JSON dari Gemini | Struk terlalu buram/rotasi salah — coba foto ulang lebih jelas dan tegak lurus |
| Supabase insert error: relation does not exist | Tabel `transactions` belum dibuat — jalankan ulang SQL schema di SQL Editor Supabase |
| Bot lambat merespons pertama kali (di Render) | Wajar, itu efek "cold start" dari free tier — request berikutnya akan cepat |
