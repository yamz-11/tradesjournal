# Jurnal Trading

Aplikasi web sederhana untuk mencatat dan menganalisis trade. Dibangun dengan Next.js dan Supabase (PostgreSQL), dengan login, penyimpanan screenshot chart, dan statistik performa.

## Fitur

- **Login** dengan email dan kata sandi (Supabase Auth). Setiap pengguna hanya bisa melihat datanya sendiri (Row Level Security).
- **Catat dan edit trade**: tanggal, simbol, posisi (long/short), harga entry/exit, ukuran, biaya, stop loss, take profit, setup, dan catatan.
- **Upload screenshot chart** (gambar, maksimal 5 MB) yang tersimpan privat di Supabase Storage.
- **R-multiple dan risk/reward**: R hasil (hasil bersih dibagi risiko awal) serta R:R rencana, lengkap dengan total R dan rata-rata R.
- **Filter** per simbol dan setup. Statistik, kurva ekuitas, dan kalender ikut terfilter.
- **Statistik**: total P&L, win rate, profit factor, rata-rata menang/kalah.
- **Kurva ekuitas** dan **kalender P&L harian** per bulan.
- Tampilan responsif dengan mode terang/gelap otomatis mengikuti perangkat.

## Teknologi

- [Next.js](https://nextjs.org) (App Router) dan TypeScript
- [Supabase](https://supabase.com): PostgreSQL, Auth, dan Storage
- CSS biasa (tanpa Tailwind)

## Struktur proyek

```
app/
  page.tsx          Halaman utama (login, form, statistik, kalender, tabel)
  globals.css       Gaya tampilan
  layout.tsx        Layout bawaan Next.js
lib/
  supabase.ts       Klien Supabase
supabase/
  schema.sql        Tabel trades + aturan keamanan (jalankan pertama)
  migration-2.sql   Kolom stop loss/take profit/screenshot + bucket storage (jalankan kedua)
.env.local.example  Contoh variabel lingkungan
```

## Prasyarat

- Node.js 20.9 atau lebih baru (cek dengan `node -v`)
- Akun [Supabase](https://supabase.com) (paket gratis cukup)
- Git

## Instalasi

### 1. Clone dan pasang dependensi

```bash
git clone <url-repo-anda>
cd <nama-folder-repo>
npm install
```

### 2. Siapkan database Supabase

1. Buat project baru di Supabase.
2. Buka **SQL Editor** > **New query**, tempel isi `supabase/schema.sql`, lalu **Run**.
3. Buat query baru, tempel isi `supabase/migration-2.sql`, lalu **Run**.

> Urutannya penting: `schema.sql` harus dijalankan lebih dulu karena migrasi menambah kolom ke tabel `trades`.

Setelah itu pastikan:
- Tabel `trades` memiliki kolom `stop_loss`, `take_profit`, dan `screenshot_path`.
- Di **Storage** ada bucket privat `screenshots` dengan empat policy berakhiran `_own`.

### 3. Atur variabel lingkungan

Buat file `.env.local` di root proyek (sejajar dengan `package.json`):

```
NEXT_PUBLIC_SUPABASE_URL=https://namaproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=isi-dengan-publishable-atau-anon-key
```

- URL berakhir di `.supabase.co`, tanpa `/rest/v1/` dan tanpa garis miring di akhir.
- Ambil key dari **Project Settings > API Keys** (atau tombol **Connect**). Gunakan key **publishable/anon**.
- **Jangan** memakai key `service_role` atau `secret` di aplikasi ini.
- File `.env.local` tidak ikut ke Git (sudah diabaikan). Setiap komputer yang menjalankan proyek harus membuat file ini sendiri.

### 4. Jalankan

```bash
npm run dev
```

Buka http://localhost:3000, daftar akun atau login, lalu mulai mencatat trade.

> Setiap kali mengubah `.env.local`, hentikan server dengan `Ctrl + C` dan jalankan lagi.

## Deploy ke Netlify

1. Push proyek ke GitHub (pastikan `.env.local` tidak ikut ter-commit).
2. Di [Netlify](https://app.netlify.com): **Add new project > Import an existing project**, pilih repo Anda. Netlify mengenali Next.js dan mengisi pengaturan build otomatis.
3. Tambahkan environment variables `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` **sebelum** deploy (nilainya ditanam saat build; kalau diubah, deploy ulang).
4. Klik **Deploy**.
5. Di Supabase buka **Authentication > URL Configuration**, lalu isi **Site URL** dan **Redirect URLs** dengan alamat Netlify Anda.

Setiap `git push` ke branch `main` akan memicu deploy otomatis.

## Keamanan

- Akses data dijaga oleh **Row Level Security** di database, bukan oleh aplikasi saja. Pengguna hanya bisa membaca dan mengubah baris miliknya.
- Screenshot disimpan di bucket **privat**. Aplikasi membukanya lewat signed URL sementara, dan file ditaruh di folder dengan nama user ID.
- Untuk pemakaian pribadi, matikan pendaftaran publik di Supabase (**Authentication > Sign In / Providers**, matikan *Allow new users to sign up*) dan hapus tombol "Daftar akun" di `app/page.tsx`.
- Gunakan kata sandi yang panjang dan unik.

## Cara perhitungan

- **P&L** = (exit − entry) × ukuran − biaya untuk long, dan (entry − exit) × ukuran − biaya untuk short.
- **R-multiple** = P&L bersih ÷ (|entry − stop loss| × ukuran). Hanya dihitung jika stop loss diisi.
- **R:R rencana** = |take profit − entry| ÷ |entry − stop loss|. Hanya dihitung jika stop loss dan take profit diisi.
- **Profit factor** = total profit ÷ total kerugian.

Perhitungan memakai selisih harga × ukuran. Untuk instrumen yang nilainya bergantung pada ukuran kontrak atau nilai pip (misalnya forex), sesuaikan cara Anda mengisi ukuran agar P&L sesuai dengan akun broker.

## Pemecahan masalah

| Masalah | Penyebab dan solusi |
|---|---|
| `supabaseUrl is required` | `.env.local` belum ada, salah nama (misalnya `.env.local.txt`), salah lokasi, atau server belum di-restart. |
| `Failed to fetch` saat login | URL Supabase salah atau jaringan tidak bisa menjangkau `supabase.co`. Coba buka `https://namaproject.supabase.co/rest/v1/` di browser. |
| `relation "public.trades" does not exist` | `schema.sql` belum dijalankan. Jalankan sebelum `migration-2.sql`. |
| `policy ... already exists` | Script sudah pernah dijalankan. Hapus policy lama atau lewati script. |
| Upload screenshot gagal (RLS) | Policy storage belum terbentuk atau Anda belum login. |
| Build Netlify gagal karena *secrets scanning* | Tambahkan variabel `SECRETS_SCAN_OMIT_KEYS` berisi `NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| Build Netlify gagal karena versi Node | Tambahkan variabel `NODE_VERSION` bernilai `20`. |

## Ide pengembangan

- Grafik performa per setup
- Ekspor ke CSV
- Impor otomatis dari riwayat broker
- Perhitungan berbasis pip/lot untuk forex
