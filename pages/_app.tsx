import type { AppProps } from "next/app";
import { useState } from "react";
import { useRouter } from "next/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { PeriodProvider } from "@/contexts/PeriodContext";
import { SeoHead } from "@/components/seo/SeoHead";
import "../src/index.css";

type SeoEntry = {
  title: string;
  description: string;
  noIndex?: boolean;
};

const DEFAULT_SEO: SeoEntry = {
  title: "Sistem Manajemen Zakat Masjid",
  description:
    "Platform profesional untuk pengelolaan zakat fitrah, zakat mal, fidyah, perhitungan distribusi, dan pelaporan operasional masjid.",
};

const ROUTE_SEO: Record<string, SeoEntry> = {
  "/": {
    title: "Beranda Operasional",
    description: "Portal AmanahZIS untuk monitoring penerimaan dan pendistribusian zakat secara terstruktur.",
    noIndex: true,
  },
  "/auth": {
    title: "Masuk",
    description: "Halaman login pengguna untuk mengakses sistem manajemen zakat (registrasi dinonaktifkan).",
    noIndex: true,
  },
  "/dashboard": {
    title: "Dashboard Operasional",
    description: "Ringkasan profesional penerimaan zakat, status distribusi, dan performa operasional periode aktif.",
  },
  "/periods": {
    title: "Periode",
    description: "Kelola periode zakat, nilai beras, uang, fidyah, harga emas, dan harga perak tiap periode.",
  },
  "/muzakki": {
    title: "Data Muzakki",
    description: "Daftar muzakki dan informasi keluarga untuk kebutuhan transaksi zakat dan fidyah.",
  },
  "/muzakki/[id]": {
    title: "Detail Muzakki",
    description: "Detail profil muzakki, anggota keluarga, dan riwayat transaksi zakat.",
  },
  "/members": {
    title: "Anggota Keluarga",
    description: "Manajemen anggota keluarga muzakki sebagai data utama pembayaran zakat per orang.",
  },
  "/mustahik": {
    title: "Mustahik",
    description: "Kelola data penerima zakat (mustahik) berdasarkan golongan asnaf.",
  },
  "/settings/asnaf": {
    title: "Pengaturan Asnaf",
    description: "Konfigurasi golongan asnaf, prioritas, dan kelayakan menerima jenis dana zakat/fidyah.",
  },
  "/zakat-fitrah": {
    title: "Transaksi Zakat Fitrah",
    description: "Input, koreksi, dan monitoring transaksi zakat fitrah per muzakki atau anggota keluarga.",
  },
  "/zakat-mal": {
    title: "Transaksi Zakat Mal",
    description: "Input dan validasi transaksi zakat mal sesuai nisab periode aktif.",
  },
  "/fidyah": {
    title: "Transaksi Fidyah",
    description: "Input transaksi fidyah per anggota pembayar berikut nominal uang atau makanan.",
  },
  "/calculations": {
    title: "Perhitungan",
    description: "Simulasi dan lock batch perhitungan pembagian zakat/fidyah sebelum pendistribusian.",
  },
  "/distribution": {
    title: "Pendistribusian",
    description: "Eksekusi dan monitoring pendistribusian zakat/fidyah kepada mustahik per batch.",
  },
  "/reports": {
    title: "Laporan",
    description: "Rekap dan laporan operasional penerimaan serta pendistribusian zakat/fidyah.",
  },
  "/settings": {
    title: "Pengaturan",
    description: "Pengaturan sistem operasional dan preferensi aplikasi zakat.",
  },
  "/admin/members": {
    title: "Manajemen Pengguna",
    description: "Kelola akun pengguna dan hak akses role aplikasi.",
  },
  "/tv": {
    title: "Live Monitoring TV",
    description: "Papan informasi publik real-time untuk penerimaan dan pendistribusian zakat masjid.",
  },
  "/404": {
    title: "Halaman Tidak Ditemukan",
    description: "Halaman yang Anda tuju tidak tersedia.",
    noIndex: true,
  },
};

export default function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const router = useRouter();
  const seo = ROUTE_SEO[router.pathname] || DEFAULT_SEO;

  return (
    <QueryClientProvider client={queryClient}>
      <SeoHead title={seo.title} description={seo.description} noIndex={seo.noIndex} />
      <TooltipProvider>
        <AuthProvider>
          <PeriodProvider>
            <Toaster />
            <Sonner />
            <Component {...pageProps} />
          </PeriodProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
