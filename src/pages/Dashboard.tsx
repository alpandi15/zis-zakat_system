import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  usePeriods,
  usePeriodSummary,
  useZakatVsFidyahComparison,
} from "@/hooks/useDashboardData";
import { useTvViewerPresence } from "@/hooks/useTvViewerPresence";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { FundComparisonChart } from "@/components/dashboard/FundComparisonChart";
import { formatCurrency, formatWeight } from "@/lib/exportUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  Wheat,
  Users,
  UserCheck,
  Settings2,
  Scale,
  Activity,
  ExternalLink,
  Eye,
  Monitor,
  Wifi,
} from "lucide-react";

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default function Dashboard() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const isAdminUser = isAdmin();

  const { data: periods, isLoading: periodsLoading } = usePeriods();
  const { data: summary, isLoading: summaryLoading } = usePeriodSummary(selectedPeriod);
  const { data: comparison, isLoading: comparisonLoading } = useZakatVsFidyahComparison(selectedPeriod);
  const { viewers: tvViewers, viewerCount, isConnected: isTvPresenceConnected } = useTvViewerPresence(isAdminUser);

  // Auto-select active period or first period
  useEffect(() => {
    if (periods && periods.length > 0 && !selectedPeriod) {
      const activePeriod = periods.find((p) => p.status === "active");
      setSelectedPeriod(activePeriod?.id || periods[0].id);
    }
  }, [periods, selectedPeriod]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Memuat...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const currentPeriod = periods?.find((p) => p.id === selectedPeriod);

  // Period configuration values
  const ricePerPerson = currentPeriod?.rice_amount_per_person ?? 2.5;
  const cashPerPerson = currentPeriod?.cash_amount_per_person ?? 35000;
  const fidyahDailyRate = currentPeriod?.fidyah_daily_rate ?? 35000;
  const nisabGoldPrice = currentPeriod?.nisab_gold_price_per_gram ?? 1200000;
  const nisabValue = 85 * nisabGoldPrice; // 85 grams of gold

  // Calculate total collected and distributed
  const totalCollectedCash = (summary?.zakat_fitrah_cash || 0) + (summary?.zakat_mal || 0) + (summary?.fidyah_cash || 0);
  const totalCollectedRice = summary?.zakat_fitrah_rice_kg || 0;
  const summaryCards = [
    {
      title: "Total Kas Terkumpul",
      value: formatCurrency(totalCollectedCash),
      icon: Coins,
      tone: "text-emerald-700",
      bg: "from-emerald-50 to-emerald-100/80 border-emerald-200/80",
      helper: "Zakat fitrah uang + zakat mal + fidyah uang",
    },
    {
      title: "Total Beras Terkumpul",
      value: formatWeight(totalCollectedRice),
      icon: Wheat,
      tone: "text-amber-700",
      bg: "from-amber-50 to-amber-100/80 border-amber-200/80",
      helper: "Akumulasi zakat fitrah beras",
    },
    {
      title: "Muzakki Kepala Keluarga",
      value: `${summary?.total_muzakki_households || 0} orang`,
      icon: Users,
      tone: "text-sky-700",
      bg: "from-sky-50 to-sky-100/80 border-sky-200/80",
      helper: "Jumlah kepala keluarga yang bertransaksi pada periode ini",
    },
    {
      title: "Muzakki Jiwa/Fitrah",
      value: `${summary?.total_jiwa_fitrah || 0} jiwa`,
      icon: Activity,
      tone: "text-cyan-700",
      bg: "from-cyan-50 to-cyan-100/80 border-cyan-200/80",
      helper: "Akumulasi total jiwa/fitrah dari transaksi zakat fitrah",
    },
    {
      title: "Distribusi Tersalurkan",
      value: `${summary?.total_distributions || 0} transaksi`,
      icon: UserCheck,
      tone: "text-violet-700",
      bg: "from-violet-50 to-violet-100/80 border-violet-200/80",
      helper: `${summary?.total_mustahik || 0} mustahik tercatat`,
    },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-4 sm:space-y-6">
        <div className="rounded-2xl border border-border/70 bg-card/65 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                Ringkasan Operasional Zakat
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Fokus pada data inti penerimaan, status distribusi, dan rekap anggota.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end xl:w-auto">
              <PeriodSelector
                periods={periods || []}
                selectedPeriod={selectedPeriod}
                onPeriodChange={setSelectedPeriod}
                isLoading={periodsLoading}
              />
              <Button asChild variant="outline" className="h-10 gap-2 whitespace-nowrap">
                <Link href="/tv" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Live Monitoring
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-cyan-50/50">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Settings2 className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                Konfigurasi Periode Aktif
              </CardTitle>
              {currentPeriod && (
                <Badge variant={currentPeriod.status === "active" ? "default" : "secondary"}>
                  {currentPeriod.status === "active" ? "Aktif" : "Arsip"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/90 p-3">
                <p className="text-[11px] text-muted-foreground">Beras per Orang</p>
                <p className="mt-1 text-sm font-semibold sm:text-base">{ricePerPerson} kg</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/90 p-3">
                <p className="text-[11px] text-muted-foreground">Uang per Orang</p>
                <p className="mt-1 text-sm font-semibold sm:text-base">Rp {cashPerPerson.toLocaleString("id-ID")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/90 p-3">
                <p className="text-[11px] text-muted-foreground">Fidyah per Hari</p>
                <p className="mt-1 text-sm font-semibold sm:text-base">Rp {fidyahDailyRate.toLocaleString("id-ID")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/90 p-3">
                <p className="text-[11px] text-muted-foreground">Nisab Zakat Mal</p>
                <p className="mt-1 text-sm font-semibold sm:text-base">Rp {nisabValue.toLocaleString("id-ID")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:text-xs">
              <Activity className="h-3.5 w-3.5" />
              {summaryLoading ? "Menghitung ringkasan periode..." : `Periode: ${currentPeriod?.name || "-"}`}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {summaryCards.map((item) => (
            <Card key={item.title} className={`border bg-gradient-to-br ${item.bg}`}>
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.title}</p>
                    <p className={`mt-1 whitespace-nowrap text-lg font-semibold leading-tight sm:text-2xl ${item.tone}`}>
                      {item.value}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.helper}</p>
                  </div>
                  <div className="rounded-xl bg-background/80 p-2.5">
                    <item.icon className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isAdminUser && (
          <Card className="border-border/70 bg-card/70">
            <CardHeader className="pb-3 px-4 pt-4 sm:px-6 sm:pt-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Eye className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                    Monitoring Viewer Live
                  </CardTitle>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Khusus admin. Menampilkan perangkat yang sedang membuka halaman live monitoring `/tv`.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                  <Badge variant="outline" className="justify-center gap-1 rounded-full px-3 py-1.5 sm:justify-start">
                    <Monitor className="h-3.5 w-3.5" />
                    {viewerCount} viewer online
                  </Badge>
                  <Badge
                    variant={isTvPresenceConnected ? "default" : "secondary"}
                    className="justify-center gap-1 rounded-full px-3 py-1.5 sm:justify-start"
                  >
                    <Wifi className="h-3.5 w-3.5" />
                    {isTvPresenceConnected ? "Presence aktif" : "Menghubungkan..."}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 sm:px-6 sm:pb-6">
              {tvViewers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Belum ada perangkat yang membuka live monitoring saat ini.
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70 md:hidden">
                    {tvViewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="grid gap-2 border-t border-border/60 px-3 py-3 first:border-t-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {viewer.deviceLabel || "Perangkat"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {viewer.browser || "Browser"} • {viewer.os || "OS"}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-[11px] text-muted-foreground">
                            {viewer.viewport || "-"} • {viewer.path || "/tv"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Masuk {formatDateTime(viewer.onlineAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="w-fit rounded-full px-2.5 py-0.5 text-[10px]">
                            {viewer.deviceType || "device"}
                          </Badge>
                          {viewer.periodId && (
                            <Badge variant="secondary" className="max-w-full rounded-full px-2.5 py-0.5 text-[10px]">
                              <span className="truncate">Periode aktif</span>
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
                    {tvViewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {viewer.deviceLabel || "Perangkat"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {viewer.browser || "Browser"} • {viewer.os || "OS"}
                            </p>
                          </div>
                          <Badge variant="outline" className="w-fit rounded-full px-2.5 py-0.5 text-[10px]">
                            {viewer.deviceType || "device"}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <p className="font-medium text-foreground">Viewport & Path</p>
                            <p className="mt-1 break-words">{viewer.viewport || "-"} • {viewer.path || "/tv"}</p>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <p className="font-medium text-foreground">Masuk</p>
                            <p className="mt-1">{formatDateTime(viewer.onlineAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <FundComparisonChart data={comparison} isLoading={comparisonLoading} />
      </div>
    </AppLayout>
  );
}
