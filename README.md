# 🕌 Zakat Fitrah Management App (Open Source)

Aplikasi ini adalah platform operasional untuk pengelolaan **Zakat Fitrah** di masjid atau organisasi keislaman.

Dirancang untuk membantu panitia (amil) dalam:
- Pendataan muzakki & mustahik
- Pengelolaan distribusi zakat
- Monitoring dan pelaporan
- Operasional zakat secara digital & transparan

---

## ⚠️ Disclaimer & Ketentuan Penggunaan

> ❗ **PENTING — HARAP DIBACA SEBELUM MENGGUNAKAN**

Aplikasi ini:

✅ **GRATIS & OPEN SOURCE**  
✅ **Dibuat khusus untuk kebutuhan masjid / organisasi zakat**  

Namun:

🚫 **TIDAK BOLEH DIGUNAKAN UNTUK TUJUAN KOMERSIAL**  
🚫 **DILARANG KERAS DIPERJUALBELIKAN DALAM BENTUK APAPUN**  

---

## 🎯 Tujuan Penggunaan

Aplikasi ini **hanya diperuntukkan untuk:**
- Panitia zakat (amil)
- Masjid
- Organisasi sosial / keislaman

---

## 🤝 Kolaborasi & Pengembangan

Silakan:
- Menggunakan aplikasi ini untuk kebutuhan internal
- Memodifikasi sesuai kebutuhan organisasi / masjid
- Berkontribusi untuk pengembangan fitur

💡 **Sangat disarankan untuk berkolaborasi** agar:
- Fitur semakin lengkap
- Sistem semakin stabil
- Bisa menjadi solusi zakat yang lebih baik untuk banyak masjid

---

## 🚀 Supabase Bootstrap Admin

Setelah migration dijalankan, akun admin bootstrap otomatis dibuat jika belum ada `super_admin`:

- Email: `admin@zakatku.local`
- Password: `Admin123!`

Command:

```sh
npx supabase login
npx supabase link --project-ref gezamfqxzdouqfbsqjgv
npx supabase db push
```

Setelah login pertama, ganti password akun admin dari Supabase Auth/User Management.

Jika muncul error login:
`{"code":"unexpected_failure","message":"Database error querying schema"}`
jalankan lagi:

```sh
npx supabase db push
```

Karena ada migration perbaikan auth bootstrap yang akan menyinkronkan kolom `auth.users` dan `auth.identities`.

## Supabase migration ops (rollback/reset)

Peringatan: command di bawah bersifat destruktif jika pakai `--linked` (remote project).

Backup dulu sebelum rollback/reset:

```sh
npx supabase db dump --linked -f backup_full.sql
npx supabase db dump --linked --role-only -f backup_roles.sql
```

Cek status migration local vs remote:

```sh
npx supabase migration list --linked
```

Rollback migration terakhir di remote:

```sh
npx supabase migration down --linked --last 1 --yes
```

Rollback beberapa migration di remote (contoh 2):

```sh
npx supabase migration down --linked --last 2 --yes
```

Apply ulang migration setelah rollback:

```sh
npx supabase db push --linked --yes
```

Reset total remote DB (hapus semua data termasuk auth/users, lalu apply ulang migration):

```sh
npx supabase db reset --linked --yes
```

Untuk local DB:

```sh
npx supabase start
npx supabase db reset --local
```

## Project info

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
