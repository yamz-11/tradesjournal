# 📈 Trade Journal - Modern Trading Journal & Analytics

Aplikasi web modern, cepat, dan komprehensif untuk mencatat, menganalisis performa trading, serta mengevaluasi psikologi trading harian dan mingguan. Dibangun menggunakan **Next.js 16** (App Router & Turbopack), **TypeScript**, **Supabase** (PostgreSQL, Auth & Storage), serta desain responsif modern dengan dukungan Dark/Light mode manual.

---

## ✨ Fitur Utama

### 1. 📊 Dashboard & Analitik Lanjutan
- **Ringkasan Finansial:** Total Net P&L, Win Rate, Profit Factor, Rata-rata Win/Loss, Total Pips, dan R-Multiple (Total & Rata-rata R).
- **Analitik Kinerja Tingkat Lanjut:**
  - **Max Drawdown:** Penurunan modal terbesar dari puncak ekuitas (*peak-to-trough*).
  - **Sharpe Ratio:** Pengukuran *risk-adjusted return* terhadap volatilitas hasil trade.
  - **Streak Tracker:** Rekor kemenangan berturut-turut (*Max Win Streak*), kekalahan berturut-turut (*Max Loss Streak*), dan streak yang sedang aktif.
  - **Performa per Setup:** Tabel efektivitas masing-masing setup/strategi trading dengan visualisasi progress bar Win Rate, Profit Factor, Rata-rata R, dan akumulasi P&L.
- **Chart Interaktif:**
  - Pilihan tampilan **Kurva Ekuitas (Equity Curve)** vs **Drawdown Curve**.
  - Garis baseline nol, hover tracking crosshair, dan floating tooltip dinamis.
- **Kalender P&L Interaktif & Export HD:** Tampilan kalender bulanan yang merangkum hasil trade per hari beserta penanda hari untung (hijau) dan rugi (merah). Dilengkapi fitur **Unduh Gambar PNG HD (Opsi Dark & Light Mode)** dengan tampilan kartu modern, ringkasan 4 metrik bulanan (Net P&L, Win Days Rate, Volume Eksekusi, Best Day), serta opsi ekspor ke format CSV.

### 2. 📋 Manajemen & Riwayat Trade
- **Pencatatan Lengkap:** Tanggal, Simbol, Posisi (Long/Short), Harga Entry & Exit, Ukuran (Lot/Unit), Stop Loss, Take Profit, Biaya (Fee/Swap), Ukuran Pip, Nilai Pip, Setup, Catatan, dan Screenshot Chart.
- **Kalkulasi Otomatis:**
  - **Pips Otomatis:** Perhitungan otomatis untuk pasangan Forex (0.0001, atau 0.01 untuk pasangan JPY), Emas/XAU (0.1), dan Perak/XAG (0.01) dengan opsi ukuran pip kustom.
  - **P&L Fleksibel:** Mendukung kalkulasi berbasis nilai per pip x lot maupun selisih harga x ukuran.
  - **R-Multiple & R:R Rencana:** Menghitung rasio Risk:Reward rencana dan realisasi R hasil.
- **Upload Screenshot Chart:** Gambar hingga 5 MB tersimpan aman dan privat di Supabase Storage.
- **Tabel Interaktif Modern:**
  - **Sorting Multikolom:** Urutkan berdasarkan Tanggal, Simbol, Posisi, Entry, Exit, Ukuran, Pips, R:R, R hasil, atau P&L.
  - **Paginasi Fleksibel:** Pengaturan jumlah baris (5, 10, 25, 50, 100 baris per halaman) dengan navigasi halaman yang mulus.
- **Filter Canggih:** Filter berdasarkan Simbol, Setup, serta **Preset Rentang Tanggal** (*Hari Ini, Minggu Ini, Bulan Ini, YTD, Semua*) dan input tanggal kustom.

### 3. 🧠 Jurnal Harian (Daily Reflection & Psychology)
- **Pelacak Mood & Psikologi:** Pilihan status psikologis saat trading (*Percaya Diri, Tenang, Netral, Cemas, FOMO, Frustrasi*).
- **Catatan Refleksi:** Dokumentasi kondisi market, kestabilan emosi, evaluasi/pelajaran hari ini, dan rencana esok hari.
- **Integrasi Otomatis:** Setiap entri jurnal harian secara otomatis menampilkan total trade dan akumulasi P&L yang terjadi pada tanggal tersebut.
- **Riwayat & Edit:** Riwayat jurnal harian yang rapi dengan opsi edit dan hapus.

### 4. 🎯 Weekly Review (Evaluasi Mingguan)
- **Navigasi Mingguan:** Tombol navigasi untuk berpindah antar minggu dengan mudah.
- **Statistik Mingguan Otomatis:** Ringkasan performa otomatis untuk minggu yang dipilih (Total trade, Win rate, Net P&L mingguan, Best trade, dan Worst trade).
- **Rating Disiplin Eksekusi:** Penilaian disiplin terhadap trading plan dan rule management dengan skala 1–5 bintang (★).
- **Format Evaluasi 3 Pilar:**
  - *What Went Well:* Apa yang berjalan dengan sangat baik.
  - *Mistakes & Weaknesses:* Kesalahan, pelanggaran rule, atau kelemahan yang terjadi.
  - *Next Week's Focus:* Komitmen spesifik dan fokus perbaikan untuk minggu berikutnya.

### 5. 🎨 UI/UX Modern & Responsif
- **Manual Dark / Light Mode:** Toggle tema yang elegan di header dan halaman login, tersimpan otomatis di `localStorage`.
- **Skeleton Shimmer Loading:** Animasi pemuatan halus saat mengambil data.
- **Sistem Notifikasi Toast:** Pesan status mengambang untuk konfirmasi simpan, edit, hapus, maupun pesan error.
- **Resilient Offline/Local Fallback:** Jika koneksi Supabase terganggu atau tabel belum dibuat, aplikasi tetap dapat beroperasi menggunakan sinkronisasi `localStorage`.

---

## 🛠️ Teknologi yang Digunakan

- **Framework:** [Next.js 16](https://nextjs.org) (App Router, Turbopack, React 19)
- **Bahasa:** [TypeScript](https://www.typescriptlang.org/)
- **Backend & Database:** [Supabase](https://supabase.com) (PostgreSQL, Supabase Auth, Row Level Security, Supabase Storage)
- **Styling:** Modern Vanilla CSS dengan CSS Custom Properties (Design Tokens), Glassmorphism, dan fluid layout tanpa dependensi CSS framework eksternal.

---

## 📦 Prasyarat Sistem

- **Node.js:** Versi 20.9.0 atau yang lebih baru (`node -v`)
- **NPM / PNPM / Yarn**
- **Akun Supabase:** (Tingkat Free Tier sudah sangat mencukupi)

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Clone Repository & Install Dependensi

```bash
git clone <url-repo-anda>
cd trade-journal
npm install
```

### 2. Konfigurasi Database Supabase

1. Buka dashboard proyek Anda di [Supabase](https://supabase.com).
2. Masuk ke menu **SQL Editor** > **New query**.
3. Buka file [`supabase/schema.sql`](supabase/schema.sql) di repositori ini, salin seluruh kodenya, tempelkan ke SQL Editor Supabase, lalu klik **Run**.
   > File `schema.sql` sudah mencakup pembuatan tabel `trades`, `daily_journals`, `weekly_reviews`, indeks performa, storage bucket `screenshots`, serta seluruh konfigurasi Row Level Security (RLS).
4. Pastikan di menu **Storage** telah terbentuk bucket privat bernama `screenshots`.

### 3. Konfigurasi Environment Variables

Buat file baru bernama `.env.local` pada direktori root proyek (sejajar dengan `package.json`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> **Catatan:**
> - Dapatkan kredensial di menu **Project Settings** > **API** di Supabase.
> - Gunakan key bertipe `anon` / `public`. **Jangan** gunakan `service_role` key di frontend.
> - Pastikan URL tidak diakhiri dengan garis miring `/`.

### 4. Jalankan Aplikasi di Mode Development

```bash
npm run dev
```

Buka peramban Anda di [http://localhost:3000](http://localhost:3000). Daftarkan akun baru Anda atau login untuk mulai mengelola jurnal trading.

### 5. Build untuk Produksi

```bash
npm run build
npm start
```

---

## 📐 Formula & Rumus Perhitungan

| Metrik | Formula / Cara Hitung |
|---|---|
| **Pips (Long)** | `(Exit Price - Entry Price) / Pip Size` |
| **Pips (Short)** | `(Entry Price - Exit Price) / Pip Size` |
| **P&L (dengan Nilai Pip)** | `(Pips * Pip Value * Quantity) - Fees` |
| **P&L (tanpa Nilai Pip)** | Long: `((Exit - Entry) * Quantity) - Fees`<br>Short: `((Entry - Exit) * Quantity) - Fees` |
| **Risiko Awal (Risk)** | Jika Stop Loss ada: `\|Entry Price - Stop Loss\| * Quantity` (atau jarak pip * nilai pip * lot) |
| **R-Multiple** | `Net P&L / Initial Risk` |
| **Plan R:R** | `\|Take Profit - Entry\| / \|Entry - Stop Loss\|` |
| **Profit Factor** | `Total Gross Profit / Total Gross Loss` |
| **Win Rate** | `(Jumlah Trade Menang / Total Trade) * 100%` |
| **Max Drawdown** | Penurunan persentase terbesar dari titik saldo tertinggi (*Peak Equity*) |
| **Sharpe Ratio** | `(Rata-rata Return Trade / Standar Deviasi Return Trade) * sqrt(Trade per Periode)` |

---

## 💡 Troubleshooting

- **Error: `supabaseUrl is required`**  
  Pastikan file `.env.local` sudah dibuat di folder root proyek dengan nama yang tepat, lalu restart server development (`Ctrl + C` lalu `npm run dev`).
- **Gagal Upload Screenshot Chart (Storage RLS)**  
  Pastikan Anda telah menjalankan seluruh skrip `schema.sql` yang membuat bucket `screenshots` dan policy kepemilikan storage (`_own`).
- **Deployment ke Netlify / Vercel**  
  Jangan lupa menambahkan environment variable `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada pengaturan platform hosting Anda.

---

## 📄 Lisensi

Proyek ini dibuat untuk kebutuhan personal & profesional journal trading. Silakan modifikasi dan kembangkan sesuai kebutuhan gaya trading Anda!
