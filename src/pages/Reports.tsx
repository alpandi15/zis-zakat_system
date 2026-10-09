import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  exportReportToExcel,
  exportReportToPDF,
  formatCurrency,
  type ReportDocument,
} from "@/lib/exportUtils";
import { FileSpreadsheet, FileText, Search } from "lucide-react";

const PAGE_SIZE = 60;

const FUND_CATEGORY_LABELS: Record<string, string> = {
  zakat_fitrah_cash: "Zakat Fitrah (Uang)",
  zakat_fitrah_rice: "Zakat Fitrah (Beras)",
  zakat_mal: "Zakat Mal",
  fidyah_cash: "Fidyah (Uang)",
  fidyah_food: "Fidyah (Makanan)",
};

const FITRAH_PAYMENT_LABELS: Record<string, string> = { rice: "Beras", money: "Uang" };
const MAL_TYPE_LABELS: Record<string, string> = {
  income: "Penghasilan",
  gold: "Emas",
  trade: "Perdagangan",
};
const FIDYAH_PAYMENT_LABELS: Record<string, string> = { cash: "Uang", food: "Makanan" };
const FIDYAH_REASON_LABELS: Record<string, string> = {
  chronic_illness: "Sakit menahun",
  elderly: "Lanjut usia",
  pregnancy: "Hamil",
  breastfeeding: "Menyusui",
  terminal_illness: "Sakit parah",
  other: "Lainnya",
};
const DISTRIBUTION_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  distributed: "Disalurkan",
  cancelled: "Dibatalkan",
};

const RECEIPT_TYPES = ["Zakat Fitrah", "Zakat Mal", "Fidyah"] as const;
type ReceiptType = (typeof RECEIPT_TYPES)[number];

interface ReceiptRow extends Record<string, unknown> {
  id: string;
  tanggal: string;
  jenis: ReceiptType;
  nomor: number;
  nama: string;
  bentuk: string;
  uang: number;
  beras: number;
  makanan: number;
  jiwa: number;
  keterangan: string;
}

interface DistributionRow extends Record<string, unknown> {
  id: string;
  tanggal: string;
  nama: string;
  asnafCode: string;
  kategori: string;
  status: string;
  uang: number;
  beras: number;
  makanan: number;
  mustahikId: string;
}

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/** Format tanggal ISO (yyyy-mm-dd) supaya konsisten di layar, PDF, dan bisa diurutkan di Excel. */
const toIsoDate = (value: string | null | undefined): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const formatKg = (value: number) => `${Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`;
const formatCount = (value: number) => Number(value || 0).toLocaleString("id-ID");

const StatTile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold leading-tight tabular-nums">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</p>}
  </div>
);

export default function Reports() {
  const { selectedPeriod } = usePeriod();
  const { getLabel } = useAsnafSettings();
  const { toast } = useToast();

  const periodId = selectedPeriod?.id || null;

  const [activeTab, setActiveTab] = useState("ringkasan");
  const [receiptType, setReceiptType] = useState<ReceiptType | "all">("all");
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptVisible, setReceiptVisible] = useState(PAGE_SIZE);
  const [distributionCategory, setDistributionCategory] = useState<string>("all");
  const [distributionSearch, setDistributionSearch] = useState("");
  const [distributionVisible, setDistributionVisible] = useState(PAGE_SIZE);

  const { data: fitrahTransactions = [], isLoading: loadingFitrah } = useQuery({
    queryKey: ["report-fitrah", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("zakat_fitrah_transactions")
        .select(
          "id, transaction_no, transaction_date, payment_type, money_amount, rice_amount_kg, total_members, notes, muzakki_id, muzakki:muzakki_id(name)",
        )
        .eq("period_id", periodId)
        .eq("is_void", false)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data as unknown as {
        id: string;
        transaction_no: number;
        transaction_date: string;
        payment_type: string;
        money_amount: number | null;
        rice_amount_kg: number | null;
        total_members: number;
        notes: string | null;
        muzakki_id: string | null;
        muzakki: { name: string } | null;
      }[];
    },
    enabled: !!periodId,
  });

  const { data: malTransactions = [], isLoading: loadingMal } = useQuery({
    queryKey: ["report-mal", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("zakat_mal_transactions")
        .select(
          "id, transaction_no, transaction_date, zakat_type, final_zakat_amount, notes, muzakki_id, muzakki:muzakki_id(name), muzakki_member:muzakki_member_id(name)",
        )
        .eq("period_id", periodId)
        .eq("is_void", false)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data as unknown as {
        id: string;
        transaction_no: number;
        transaction_date: string;
        zakat_type: string;
        final_zakat_amount: number;
        notes: string | null;
        muzakki_id: string | null;
        muzakki: { name: string } | null;
        muzakki_member: { name: string } | null;
      }[];
    },
    enabled: !!periodId,
  });

  const { data: fidyahTransactions = [], isLoading: loadingFidyah } = useQuery({
    queryKey: ["report-fidyah", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("fidyah_transactions")
        .select(
          "id, transaction_no, transaction_date, payment_type, payer_name, cash_amount, food_amount_kg, missed_days, reason, notes, payer_muzakki_id",
        )
        .eq("period_id", periodId)
        .eq("is_void", false)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data as unknown as {
        id: string;
        transaction_no: number;
        transaction_date: string;
        payment_type: string;
        payer_name: string;
        cash_amount: number | null;
        food_amount_kg: number | null;
        missed_days: number;
        reason: string;
        notes: string | null;
        payer_muzakki_id: string | null;
      }[];
    },
    enabled: !!periodId,
  });

  const { data: zakatDistributions = [], isLoading: loadingZakatDist } = useQuery({
    queryKey: ["report-zakat-distributions", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("zakat_distributions")
        .select("id, distribution_date, fund_category, status, cash_amount, rice_amount_kg, mustahik_id, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", periodId)
        .order("distribution_date", { ascending: true });
      if (error) throw error;
      return data as unknown as {
        id: string;
        distribution_date: string;
        fund_category: string;
        status: string;
        cash_amount: number | null;
        rice_amount_kg: number | null;
        mustahik_id: string;
        mustahik: { name: string; asnaf: string } | null;
      }[];
    },
    enabled: !!periodId,
  });

  const { data: fidyahDistributions = [], isLoading: loadingFidyahDist } = useQuery({
    queryKey: ["report-fidyah-distributions", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("fidyah_distributions")
        .select("id, distribution_date, fund_category, status, cash_amount, food_amount_kg, mustahik_id, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", periodId)
        .order("distribution_date", { ascending: true });
      if (error) throw error;
      return data as unknown as {
        id: string;
        distribution_date: string;
        fund_category: string;
        status: string;
        cash_amount: number | null;
        food_amount_kg: number | null;
        mustahik_id: string;
        mustahik: { name: string; asnaf: string } | null;
      }[];
    },
    enabled: !!periodId,
  });

  const isLoading = loadingFitrah || loadingMal || loadingFidyah || loadingZakatDist || loadingFidyahDist;

  /* ---------------- Penerimaan ---------------- */

  const receiptRows = useMemo<ReceiptRow[]>(() => {
    const rows: ReceiptRow[] = [];

    fitrahTransactions.forEach((trx) => {
      rows.push({
        id: `zf-${trx.id}`,
        tanggal: toIsoDate(trx.transaction_date),
        jenis: "Zakat Fitrah",
        nomor: trx.transaction_no,
        nama: trx.muzakki?.name || "-",
        bentuk: FITRAH_PAYMENT_LABELS[trx.payment_type] || trx.payment_type,
        uang: toNumber(trx.money_amount),
        beras: toNumber(trx.rice_amount_kg),
        makanan: 0,
        jiwa: toNumber(trx.total_members),
        keterangan: trx.notes || "",
      });
    });

    malTransactions.forEach((trx) => {
      rows.push({
        id: `zm-${trx.id}`,
        tanggal: toIsoDate(trx.transaction_date),
        jenis: "Zakat Mal",
        nomor: trx.transaction_no,
        nama: trx.muzakki_member?.name || trx.muzakki?.name || "-",
        bentuk: MAL_TYPE_LABELS[trx.zakat_type] || trx.zakat_type,
        uang: toNumber(trx.final_zakat_amount),
        beras: 0,
        makanan: 0,
        jiwa: 0,
        keterangan: trx.notes || "",
      });
    });

    fidyahTransactions.forEach((trx) => {
      rows.push({
        id: `fd-${trx.id}`,
        tanggal: toIsoDate(trx.transaction_date),
        jenis: "Fidyah",
        nomor: trx.transaction_no,
        nama: trx.payer_name || "-",
        bentuk: FIDYAH_PAYMENT_LABELS[trx.payment_type] || trx.payment_type,
        uang: toNumber(trx.cash_amount),
        beras: 0,
        makanan: toNumber(trx.food_amount_kg),
        jiwa: 0,
        keterangan:
          [FIDYAH_REASON_LABELS[trx.reason] || trx.reason, trx.missed_days ? `${trx.missed_days} hari` : ""]
            .filter(Boolean)
            .join(" - ") || "",
      });
    });

    return rows.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.jenis.localeCompare(b.jenis));
  }, [fitrahTransactions, malTransactions, fidyahTransactions]);

  const receiptTotals = useMemo(() => {
    const zakatFitrahCash = fitrahTransactions.reduce((sum, trx) => sum + toNumber(trx.money_amount), 0);
    const zakatFitrahRice = fitrahTransactions.reduce((sum, trx) => sum + toNumber(trx.rice_amount_kg), 0);
    const zakatMal = malTransactions.reduce((sum, trx) => sum + toNumber(trx.final_zakat_amount), 0);
    const fidyahCash = fidyahTransactions.reduce((sum, trx) => sum + toNumber(trx.cash_amount), 0);
    const fidyahFood = fidyahTransactions.reduce((sum, trx) => sum + toNumber(trx.food_amount_kg), 0);
    const jiwa = fitrahTransactions.reduce((sum, trx) => sum + toNumber(trx.total_members), 0);

    const households = new Set<string>();
    fitrahTransactions.forEach((trx) => trx.muzakki_id && households.add(trx.muzakki_id));
    malTransactions.forEach((trx) => trx.muzakki_id && households.add(trx.muzakki_id));
    fidyahTransactions.forEach((trx) => trx.payer_muzakki_id && households.add(trx.payer_muzakki_id));

    return {
      zakatFitrahCash,
      zakatFitrahRice,
      zakatMal,
      fidyahCash,
      fidyahFood,
      totalCash: zakatFitrahCash + zakatMal + fidyahCash,
      totalRice: zakatFitrahRice,
      totalFood: fidyahFood,
      jiwa,
      households: households.size,
      transactionCount: fitrahTransactions.length + malTransactions.length + fidyahTransactions.length,
      fitrahCount: fitrahTransactions.length,
      malCount: malTransactions.length,
      fidyahCount: fidyahTransactions.length,
    };
  }, [fitrahTransactions, malTransactions, fidyahTransactions]);

  const receiptCategoryRows = useMemo(
    () => [
      {
        kategori: FUND_CATEGORY_LABELS.zakat_fitrah_cash,
        transaksi: fitrahTransactions.filter((trx) => toNumber(trx.money_amount) > 0).length,
        uang: receiptTotals.zakatFitrahCash,
        beras: 0,
        makanan: 0,
      },
      {
        kategori: FUND_CATEGORY_LABELS.zakat_fitrah_rice,
        transaksi: fitrahTransactions.filter((trx) => toNumber(trx.rice_amount_kg) > 0).length,
        uang: 0,
        beras: receiptTotals.zakatFitrahRice,
        makanan: 0,
      },
      {
        kategori: FUND_CATEGORY_LABELS.zakat_mal,
        transaksi: receiptTotals.malCount,
        uang: receiptTotals.zakatMal,
        beras: 0,
        makanan: 0,
      },
      {
        kategori: FUND_CATEGORY_LABELS.fidyah_cash,
        transaksi: fidyahTransactions.filter((trx) => toNumber(trx.cash_amount) > 0).length,
        uang: receiptTotals.fidyahCash,
        beras: 0,
        makanan: 0,
      },
      {
        kategori: FUND_CATEGORY_LABELS.fidyah_food,
        transaksi: fidyahTransactions.filter((trx) => toNumber(trx.food_amount_kg) > 0).length,
        uang: 0,
        beras: 0,
        makanan: receiptTotals.fidyahFood,
      },
    ],
    [fitrahTransactions, fidyahTransactions, receiptTotals],
  );

  /* ---------------- Penyaluran ---------------- */

  const allDistributionRows = useMemo<DistributionRow[]>(() => {
    const rows: DistributionRow[] = [];

    zakatDistributions.forEach((item) => {
      rows.push({
        id: `zd-${item.id}`,
        tanggal: toIsoDate(item.distribution_date),
        nama: item.mustahik?.name || "-",
        asnafCode: item.mustahik?.asnaf || "lainnya",
        kategori: FUND_CATEGORY_LABELS[item.fund_category] || item.fund_category,
        status: item.status,
        uang: toNumber(item.cash_amount),
        beras: toNumber(item.rice_amount_kg),
        makanan: 0,
        mustahikId: item.mustahik_id,
      });
    });

    fidyahDistributions.forEach((item) => {
      rows.push({
        id: `fdd-${item.id}`,
        tanggal: toIsoDate(item.distribution_date),
        nama: item.mustahik?.name || "-",
        asnafCode: item.mustahik?.asnaf || "lainnya",
        kategori: FUND_CATEGORY_LABELS[item.fund_category] || item.fund_category,
        status: item.status,
        uang: toNumber(item.cash_amount),
        beras: 0,
        makanan: toNumber(item.food_amount_kg),
        mustahikId: item.mustahik_id,
      });
    });

    return rows.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama));
  }, [zakatDistributions, fidyahDistributions]);

  const distributedRows = useMemo(
    () => allDistributionRows.filter((row) => row.status === "distributed"),
    [allDistributionRows],
  );

  const pendingDistributionCount = allDistributionRows.length - distributedRows.length;

  const distributionTotals = useMemo(() => {
    const recipients = new Set<string>();
    const totals = distributedRows.reduce(
      (acc, row) => {
        acc.uang += row.uang;
        acc.beras += row.beras;
        acc.makanan += row.makanan;
        recipients.add(row.mustahikId);
        return acc;
      },
      { uang: 0, beras: 0, makanan: 0 },
    );
    return { ...totals, recipients: recipients.size, count: distributedRows.length };
  }, [distributedRows]);

  const distributionCategoryRows = useMemo(() => {
    const map = new Map<string, { kategori: string; penyaluran: number; penerima: Set<string>; uang: number; beras: number; makanan: number }>();

    distributedRows.forEach((row) => {
      const current =
        map.get(row.kategori) || {
          kategori: row.kategori,
          penyaluran: 0,
          penerima: new Set<string>(),
          uang: 0,
          beras: 0,
          makanan: 0,
        };
      current.penyaluran += 1;
      current.penerima.add(row.mustahikId);
      current.uang += row.uang;
      current.beras += row.beras;
      current.makanan += row.makanan;
      map.set(row.kategori, current);
    });

    return Array.from(map.values())
      .map((item) => ({ ...item, penerima: item.penerima.size }))
      .sort((a, b) => a.kategori.localeCompare(b.kategori));
  }, [distributedRows]);

  const asnafRecapRows = useMemo(() => {
    const map = new Map<string, { asnafCode: string; penerima: Set<string>; penyaluran: number; uang: number; beras: number; makanan: number }>();

    distributedRows.forEach((row) => {
      const current =
        map.get(row.asnafCode) || {
          asnafCode: row.asnafCode,
          penerima: new Set<string>(),
          penyaluran: 0,
          uang: 0,
          beras: 0,
          makanan: 0,
        };
      current.penerima.add(row.mustahikId);
      current.penyaluran += 1;
      current.uang += row.uang;
      current.beras += row.beras;
      current.makanan += row.makanan;
      map.set(row.asnafCode, current);
    });

    return Array.from(map.values())
      .map((item) => ({
        golongan: getLabel(item.asnafCode),
        penerima: item.penerima.size,
        penyaluran: item.penyaluran,
        uang: item.uang,
        beras: item.beras,
        makanan: item.makanan,
      }))
      .sort((a, b) => b.uang - a.uang || a.golongan.localeCompare(b.golongan));
  }, [distributedRows, getLabel]);

  const fundPositionRows = useMemo(
    () => [
      {
        pos: "Uang (zakat fitrah + zakat mal + fidyah)",
        masuk: receiptTotals.totalCash,
        keluar: distributionTotals.uang,
        sisa: receiptTotals.totalCash - distributionTotals.uang,
      },
      {
        pos: "Beras zakat fitrah (kg)",
        masuk: receiptTotals.totalRice,
        keluar: distributionTotals.beras,
        sisa: receiptTotals.totalRice - distributionTotals.beras,
      },
      {
        pos: "Makanan fidyah (kg)",
        masuk: receiptTotals.totalFood,
        keluar: distributionTotals.makanan,
        sisa: receiptTotals.totalFood - distributionTotals.makanan,
      },
    ],
    [receiptTotals, distributionTotals],
  );

  /* ---------------- Filter tampilan ---------------- */

  const filteredReceipts = useMemo(() => {
    const keyword = receiptSearch.trim().toLowerCase();
    return receiptRows.filter((row) => {
      if (receiptType !== "all" && row.jenis !== receiptType) return false;
      if (keyword && !row.nama.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [receiptRows, receiptType, receiptSearch]);

  const filteredDistributions = useMemo(() => {
    const keyword = distributionSearch.trim().toLowerCase();
    return distributedRows.filter((row) => {
      if (distributionCategory !== "all" && row.kategori !== distributionCategory) return false;
      if (keyword && !row.nama.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [distributedRows, distributionCategory, distributionSearch]);

  useEffect(() => {
    setReceiptVisible(PAGE_SIZE);
  }, [receiptType, receiptSearch, periodId]);

  useEffect(() => {
    setDistributionVisible(PAGE_SIZE);
  }, [distributionCategory, distributionSearch, periodId]);

  /* ---------------- Dokumen ekspor ---------------- */

  const periodLabel = selectedPeriod
    ? `${selectedPeriod.name} (${selectedPeriod.hijri_year} H / ${selectedPeriod.gregorian_year} M)`
    : "-";

  const buildReportDocument = (): ReportDocument => ({
    title: "Laporan Zakat, Infak & Fidyah",
    subtitle: periodLabel,
    meta: [
      { label: "Periode", value: periodLabel },
      {
        label: "Rentang",
        value:
          selectedPeriod?.start_date && selectedPeriod?.end_date
            ? `${toIsoDate(selectedPeriod.start_date)} s/d ${toIsoDate(selectedPeriod.end_date)}`
            : "-",
      },
      { label: "Status", value: selectedPeriod?.status === "archived" ? "Arsip" : "Aktif" },
    ],
    sections: [
      {
        type: "stats",
        title: "Ringkasan Periode",
        note: "Dihitung dari seluruh transaksi sah (tidak dibatalkan) pada periode ini.",
        items: [
          { label: "Penerimaan Uang", value: formatCurrency(receiptTotals.totalCash), hint: `${formatCount(receiptTotals.transactionCount)} transaksi` },
          { label: "Penerimaan Beras", value: formatKg(receiptTotals.totalRice), hint: "Zakat fitrah beras" },
          { label: "Penerimaan Makanan", value: formatKg(receiptTotals.totalFood), hint: "Fidyah makanan" },
          { label: "Muzakki Keluarga", value: formatCount(receiptTotals.households), hint: `${formatCount(receiptTotals.jiwa)} jiwa fitrah` },
          { label: "Uang Tersalurkan", value: formatCurrency(distributionTotals.uang), hint: `${formatCount(distributionTotals.count)} penyaluran` },
          { label: "Beras Tersalurkan", value: formatKg(distributionTotals.beras) },
          { label: "Makanan Tersalurkan", value: formatKg(distributionTotals.makanan) },
          { label: "Mustahik Penerima", value: formatCount(distributionTotals.recipients), hint: "Mustahik unik" },
        ],
      },
      {
        type: "table",
        title: "Penerimaan per Kategori",
        columns: [
          { header: "Kategori Dana", key: "kategori", width: 26 },
          { header: "Transaksi", key: "transaksi", format: "number", total: true, width: 12 },
          { header: "Uang", key: "uang", format: "currency", total: true, width: 18 },
          { header: "Beras", key: "beras", format: "weight", total: true, width: 14 },
          { header: "Makanan", key: "makanan", format: "weight", total: true, width: 14 },
        ],
        rows: receiptCategoryRows,
        showTotals: true,
      },
      {
        type: "table",
        title: "Penyaluran per Kategori",
        note:
          pendingDistributionCount > 0
            ? `Hanya penyaluran berstatus "Disalurkan". ${pendingDistributionCount} catatan berstatus lain tidak dihitung.`
            : 'Hanya penyaluran berstatus "Disalurkan".',
        columns: [
          { header: "Kategori Dana", key: "kategori", width: 26 },
          { header: "Penyaluran", key: "penyaluran", format: "number", total: true, width: 12 },
          { header: "Penerima", key: "penerima", format: "number", total: true, width: 12 },
          { header: "Uang", key: "uang", format: "currency", total: true, width: 18 },
          { header: "Beras", key: "beras", format: "weight", total: true, width: 14 },
          { header: "Makanan", key: "makanan", format: "weight", total: true, width: 14 },
        ],
        rows: distributionCategoryRows,
        showTotals: true,
        emptyMessage: "Belum ada penyaluran yang tercatat.",
      },
      {
        type: "table",
        title: "Posisi Dana",
        note: "Sisa = penerimaan dikurangi penyaluran yang sudah tercatat.",
        columns: [
          { header: "Pos Dana", key: "pos", width: 38 },
          { header: "Masuk", key: "masuk", format: "number", width: 16 },
          { header: "Keluar", key: "keluar", format: "number", width: 16 },
          { header: "Sisa", key: "sisa", format: "number", width: 16 },
        ],
        rows: fundPositionRows,
      },
      {
        type: "table",
        title: "Rekap per Golongan",
        columns: [
          { header: "Golongan (Asnaf)", key: "golongan", width: 22 },
          { header: "Penerima", key: "penerima", format: "number", total: true, width: 12 },
          { header: "Penyaluran", key: "penyaluran", format: "number", total: true, width: 12 },
          { header: "Uang", key: "uang", format: "currency", total: true, width: 18 },
          { header: "Beras", key: "beras", format: "weight", total: true, width: 14 },
          { header: "Makanan", key: "makanan", format: "weight", total: true, width: 14 },
        ],
        rows: asnafRecapRows,
        showTotals: true,
        emptyMessage: "Belum ada penyaluran yang tercatat.",
      },
      {
        type: "table",
        title: "Detail Penerimaan",
        note: "Seluruh transaksi sah pada periode ini, diurutkan menurut tanggal.",
        columns: [
          { header: "Tanggal", key: "tanggal", format: "date", width: 12 },
          { header: "Jenis", key: "jenis", width: 14 },
          { header: "No", key: "nomor", format: "number", width: 8 },
          { header: "Nama", key: "nama", width: 26 },
          { header: "Bentuk", key: "bentuk", width: 12 },
          { header: "Uang", key: "uang", format: "currency", total: true, width: 16 },
          { header: "Beras", key: "beras", format: "weight", total: true, width: 12 },
          { header: "Makanan", key: "makanan", format: "weight", total: true, width: 12 },
          { header: "Jiwa", key: "jiwa", format: "number", total: true, width: 8 },
        ],
        rows: receiptRows,
        showTotals: true,
        emptyMessage: "Belum ada penerimaan pada periode ini.",
      },
      {
        type: "table",
        title: "Detail Penyaluran",
        note: 'Hanya penyaluran berstatus "Disalurkan".',
        columns: [
          { header: "Tanggal", key: "tanggal", format: "date", width: 12 },
          { header: "Mustahik", key: "nama", width: 26 },
          { header: "Golongan", key: "golongan", width: 16 },
          { header: "Kategori Dana", key: "kategori", width: 22 },
          { header: "Uang", key: "uang", format: "currency", total: true, width: 16 },
          { header: "Beras", key: "beras", format: "weight", total: true, width: 12 },
          { header: "Makanan", key: "makanan", format: "weight", total: true, width: 12 },
        ],
        rows: distributedRows.map((row) => ({ ...row, golongan: getLabel(row.asnafCode) })),
        showTotals: true,
        emptyMessage: "Belum ada penyaluran yang tercatat.",
      },
    ],
    notes: [
      "Transaksi yang dibatalkan (void) tidak dihitung dalam laporan ini.",
      "Nilai beras dan makanan dinyatakan dalam kilogram.",
    ],
    signatures: [{ role: "Ketua Panitia" }, { role: "Bendahara" }, { role: "Sekretaris" }],
    orientation: "portrait",
  });

  const exportFilename = `laporan-${(selectedPeriod?.name || "periode").toLowerCase().replace(/\s+/g, "-")}`;

  const handleExport = (target: "pdf" | "excel") => {
    if (!selectedPeriod) {
      toast({ variant: "destructive", title: "Pilih periode terlebih dahulu" });
      return;
    }

    try {
      const document = buildReportDocument();
      if (target === "pdf") exportReportToPDF(document, exportFilename);
      else exportReportToExcel(document, exportFilename);
      toast({ title: `Laporan ${target === "pdf" ? "PDF" : "Excel"} berhasil diunduh` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal membuat laporan",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    }
  };

  const distributionCategoryOptions = useMemo(
    () => Array.from(new Set(distributedRows.map((row) => row.kategori))).sort(),
    [distributedRows],
  );

  const visibleReceipts = filteredReceipts.slice(0, receiptVisible);
  const visibleDistributions = filteredDistributions.slice(0, distributionVisible);

  return (
    <AppLayout title="Laporan">
      <div className="space-y-4">
        {/* Header + ekspor */}
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Laporan periode</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                {selectedPeriod?.name || "Periode belum dipilih"}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {selectedPeriod && (
                  <Badge variant="outline" className="rounded-full">
                    {selectedPeriod.hijri_year} H / {selectedPeriod.gregorian_year} M
                  </Badge>
                )}
                {selectedPeriod?.start_date && selectedPeriod?.end_date && (
                  <Badge variant="outline" className="rounded-full tabular-nums">
                    {toIsoDate(selectedPeriod.start_date)} s/d {toIsoDate(selectedPeriod.end_date)}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`rounded-full ${
                    selectedPeriod?.status === "archived"
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-emerald-300 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {selectedPeriod?.status === "archived" ? "Arsip" : "Aktif"}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-xl" disabled={!selectedPeriod || isLoading} onClick={() => handleExport("pdf")}>
                  <FileText className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={!selectedPeriod || isLoading}
                  onClick={() => handleExport("excel")}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Download Excel
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground sm:text-right">
                Berisi ringkasan, rekap per kategori & golongan, serta detail penerimaan dan penyaluran.
              </p>
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Penerimaan Uang"
            value={formatCurrency(receiptTotals.totalCash)}
            hint={`${formatCount(receiptTotals.transactionCount)} transaksi`}
          />
          <StatTile label="Penerimaan Beras" value={formatKg(receiptTotals.totalRice)} hint="Zakat fitrah beras" />
          <StatTile label="Penerimaan Makanan" value={formatKg(receiptTotals.totalFood)} hint="Fidyah makanan" />
          <StatTile
            label="Muzakki Keluarga"
            value={formatCount(receiptTotals.households)}
            hint={`${formatCount(receiptTotals.jiwa)} jiwa fitrah`}
          />
          <StatTile
            label="Uang Tersalurkan"
            value={formatCurrency(distributionTotals.uang)}
            hint={`Sisa ${formatCurrency(receiptTotals.totalCash - distributionTotals.uang)}`}
          />
          <StatTile
            label="Beras Tersalurkan"
            value={formatKg(distributionTotals.beras)}
            hint={`Sisa ${formatKg(receiptTotals.totalRice - distributionTotals.beras)}`}
          />
          <StatTile
            label="Makanan Tersalurkan"
            value={formatKg(distributionTotals.makanan)}
            hint={`Sisa ${formatKg(receiptTotals.totalFood - distributionTotals.makanan)}`}
          />
          <StatTile
            label="Mustahik Penerima"
            value={formatCount(distributionTotals.recipients)}
            hint={`${formatCount(distributionTotals.count)} penyaluran`}
          />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
            <TabsTrigger value="ringkasan" className="rounded-lg">
              Ringkasan
            </TabsTrigger>
            <TabsTrigger value="penerimaan" className="rounded-lg">
              Penerimaan ({receiptRows.length})
            </TabsTrigger>
            <TabsTrigger value="penyaluran" className="rounded-lg">
              Penyaluran ({distributedRows.length})
            </TabsTrigger>
            <TabsTrigger value="asnaf" className="rounded-lg">
              Rekap Golongan
            </TabsTrigger>
          </TabsList>

          {/* Ringkasan */}
          <TabsContent value="ringkasan" className="mt-3 space-y-3">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Penerimaan per kategori</CardTitle>
                <CardDescription>Dihitung dari transaksi sah (tidak dibatalkan) pada periode ini.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Kategori dana</TableHead>
                        <TableHead className="text-right">Transaksi</TableHead>
                        <TableHead className="text-right">Uang</TableHead>
                        <TableHead className="text-right">Beras</TableHead>
                        <TableHead className="text-right">Makanan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiptCategoryRows.map((row) => (
                        <TableRow key={row.kategori}>
                          <TableCell className="font-medium">{row.kategori}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatCount(row.transaksi)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.uang > 0 ? formatCurrency(row.uang) : "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.beras > 0 ? formatKg(row.beras) : "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.makanan > 0 ? formatKg(row.makanan) : "-"}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(receiptTotals.transactionCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(receiptTotals.totalCash)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatKg(receiptTotals.totalRice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatKg(receiptTotals.totalFood)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 xl:grid-cols-2">
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Penyaluran per kategori</CardTitle>
                  <CardDescription>
                    Hanya penyaluran berstatus &quot;Disalurkan&quot;.
                    {pendingDistributionCount > 0
                      ? ` ${pendingDistributionCount} catatan berstatus lain tidak dihitung.`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {distributionCategoryRows.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Belum ada penyaluran tercatat.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead>Kategori</TableHead>
                            <TableHead className="text-right">Penerima</TableHead>
                            <TableHead className="text-right">Uang</TableHead>
                            <TableHead className="text-right">Barang</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {distributionCategoryRows.map((row) => (
                            <TableRow key={row.kategori}>
                              <TableCell className="font-medium">{row.kategori}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{row.penerima}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.uang > 0 ? formatCurrency(row.uang) : "-"}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.beras > 0 ? formatKg(row.beras) : row.makanan > 0 ? formatKg(row.makanan) : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Posisi dana</CardTitle>
                  <CardDescription>Penerimaan dikurangi penyaluran yang sudah tercatat.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Pos dana</TableHead>
                          <TableHead className="text-right">Masuk</TableHead>
                          <TableHead className="text-right">Keluar</TableHead>
                          <TableHead className="text-right">Sisa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fundPositionRows.map((row, index) => {
                          const isCash = index === 0;
                          const render = (value: number) => (isCash ? formatCurrency(value) : formatKg(value));
                          return (
                            <TableRow key={row.pos}>
                              <TableCell className="font-medium">{row.pos}</TableCell>
                              <TableCell className="text-right tabular-nums">{render(row.masuk)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{render(row.keluar)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{render(row.sisa)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Detail penerimaan */}
          <TabsContent value="penerimaan" className="mt-3">
            <Card className="border-border/70">
              <CardHeader className="gap-3 pb-3">
                <div>
                  <CardTitle className="text-base">Detail penerimaan</CardTitle>
                  <CardDescription>Zakat fitrah, zakat mal, dan fidyah dalam satu daftar.</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={receiptSearch}
                      onChange={(event) => setReceiptSearch(event.target.value)}
                      placeholder="Cari nama muzakki"
                      className="h-10 rounded-xl pl-9"
                    />
                  </div>
                  <Select value={receiptType} onValueChange={(value) => setReceiptType(value as ReceiptType | "all")}>
                    <SelectTrigger className="h-10 w-full rounded-xl sm:w-[200px]">
                      <SelectValue placeholder="Semua jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua jenis</SelectItem>
                      {RECEIPT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredReceipts.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {receiptRows.length === 0 ? "Belum ada penerimaan pada periode ini." : "Tidak ada data yang cocok."}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Jenis</TableHead>
                            <TableHead className="text-right">No</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Bentuk</TableHead>
                            <TableHead className="text-right">Uang</TableHead>
                            <TableHead className="text-right">Beras</TableHead>
                            <TableHead className="text-right">Makanan</TableHead>
                            <TableHead className="text-right">Jiwa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleReceipts.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{row.tanggal}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="rounded-full">
                                  {row.jenis}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{row.nomor}</TableCell>
                              <TableCell className="font-medium">{row.nama}</TableCell>
                              <TableCell className="text-muted-foreground">{row.bentuk}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.uang > 0 ? formatCurrency(row.uang) : "-"}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.beras > 0 ? formatKg(row.beras) : "-"}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.makanan > 0 ? formatKg(row.makanan) : "-"}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{row.jiwa || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Menampilkan {visibleReceipts.length} dari {filteredReceipts.length} transaksi.
                      </p>
                      {visibleReceipts.length < filteredReceipts.length && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setReceiptVisible((prev) => prev + PAGE_SIZE)}
                        >
                          Muat lebih banyak
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detail penyaluran */}
          <TabsContent value="penyaluran" className="mt-3">
            <Card className="border-border/70">
              <CardHeader className="gap-3 pb-3">
                <div>
                  <CardTitle className="text-base">Detail penyaluran</CardTitle>
                  <CardDescription>
                    Hanya penyaluran berstatus &quot;{DISTRIBUTION_STATUS_LABELS.distributed}&quot;.
                    {pendingDistributionCount > 0
                      ? ` ${pendingDistributionCount} catatan berstatus lain tidak dihitung.`
                      : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={distributionSearch}
                      onChange={(event) => setDistributionSearch(event.target.value)}
                      placeholder="Cari nama mustahik"
                      className="h-10 rounded-xl pl-9"
                    />
                  </div>
                  <Select value={distributionCategory} onValueChange={setDistributionCategory}>
                    <SelectTrigger className="h-10 w-full rounded-xl sm:w-[240px]">
                      <SelectValue placeholder="Semua kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua kategori</SelectItem>
                      {distributionCategoryOptions.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredDistributions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {distributedRows.length === 0 ? "Belum ada penyaluran tercatat." : "Tidak ada data yang cocok."}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Mustahik</TableHead>
                            <TableHead>Golongan</TableHead>
                            <TableHead>Kategori dana</TableHead>
                            <TableHead className="text-right">Uang</TableHead>
                            <TableHead className="text-right">Beras</TableHead>
                            <TableHead className="text-right">Makanan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleDistributions.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{row.tanggal}</TableCell>
                              <TableCell className="font-medium">{row.nama}</TableCell>
                              <TableCell>
                                <Badge variant={row.asnafCode === "amil" ? "default" : "outline"} className="rounded-full">
                                  {getLabel(row.asnafCode)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{row.kategori}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.uang > 0 ? formatCurrency(row.uang) : "-"}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.beras > 0 ? formatKg(row.beras) : "-"}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.makanan > 0 ? formatKg(row.makanan) : "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Menampilkan {visibleDistributions.length} dari {filteredDistributions.length} penyaluran.
                      </p>
                      {visibleDistributions.length < filteredDistributions.length && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setDistributionVisible((prev) => prev + PAGE_SIZE)}
                        >
                          Muat lebih banyak
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rekap golongan */}
          <TabsContent value="asnaf" className="mt-3">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Rekap per golongan (asnaf)</CardTitle>
                <CardDescription>Total yang diterima setiap golongan mustahik pada periode ini.</CardDescription>
              </CardHeader>
              <CardContent>
                {asnafRecapRows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Belum ada penyaluran tercatat.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Golongan</TableHead>
                          <TableHead className="text-right">Penerima</TableHead>
                          <TableHead className="text-right">Penyaluran</TableHead>
                          <TableHead className="text-right">Uang</TableHead>
                          <TableHead className="text-right">Beras</TableHead>
                          <TableHead className="text-right">Makanan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {asnafRecapRows.map((row) => (
                          <TableRow key={row.golongan}>
                            <TableCell className="font-medium">{row.golongan}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.penerima}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{row.penyaluran}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.uang > 0 ? formatCurrency(row.uang) : "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.beras > 0 ? formatKg(row.beras) : "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.makanan > 0 ? formatKg(row.makanan) : "-"}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right tabular-nums">{distributionTotals.recipients}</TableCell>
                          <TableCell className="text-right tabular-nums">{distributionTotals.count}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(distributionTotals.uang)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatKg(distributionTotals.beras)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatKg(distributionTotals.makanan)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
