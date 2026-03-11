import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  usePeriods,
  usePeriodSummary,
  useMemberZakatData,
  useZakatVsFidyahComparison,
} from "@/hooks/useDashboardData";
import { StatCard } from "@/components/dashboard/StatCard";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { FundComparisonChart } from "@/components/dashboard/FundComparisonChart";
import { MemberZakatTable } from "@/components/dashboard/MemberZakatTable";
import { PeriodSummaryExport } from "@/components/dashboard/PeriodSummaryExport";
import { formatCurrency, formatWeight } from "@/lib/exportUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  Wheat,
  Users,
  HandHeart,
  TrendingUp,
  Package,
  Settings2,
  Scale,
  Calendar,
  ArrowDownCircle,
} from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  const { data: periods, isLoading: periodsLoading } = usePeriods();
  const { data: summary, isLoading: summaryLoading } = usePeriodSummary(selectedPeriod);
  const { data: memberData, isLoading: memberLoading } = useMemberZakatData(selectedPeriod);
  const { data: comparison, isLoading: comparisonLoading } = useZakatVsFidyahComparison(selectedPeriod);

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

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-muted-foreground">
              Ringkasan penerimaan dan pendistribusian zakat/fidyah
            </p>
          </div>
          <PeriodSelector
            periods={periods || []}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            isLoading={periodsLoading}
          />
        </div>

        {/* Period Configuration Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-primary" />
                Konfigurasi Periode Aktif
              </CardTitle>
              {currentPeriod && (
                <Badge variant={currentPeriod.status === "active" ? "default" : "secondary"}>
                  {currentPeriod.status === "active" ? "Aktif" : "Arsip"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                <div className="rounded-full bg-green-100 p-2">
                  <Wheat className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Beras/Orang</p>
                  <p className="font-semibold">{ricePerPerson} kg</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                <div className="rounded-full bg-blue-100 p-2">
                  <Coins className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uang/Orang</p>
                  <p className="font-semibold">Rp {cashPerPerson.toLocaleString("id-ID")}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                <div className="rounded-full bg-amber-100 p-2">
                  <Calendar className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fidyah/Hari</p>
                  <p className="font-semibold">Rp {fidyahDailyRate.toLocaleString("id-ID")}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                <div className="rounded-full bg-purple-100 p-2">
                  <Scale className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nisab Zakat Mal</p>
                  <p className="font-semibold">Rp {nisabValue.toLocaleString("id-ID")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collection Stats Grid */}
        <div>
          <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Penerimaan Dana
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              title="Zakat Fitrah (Uang)"
              value={formatCurrency(summary?.zakat_fitrah_cash || 0)}
              icon={Coins}
              variant="success"
            />
            <StatCard
              title="Zakat Fitrah (Beras)"
              value={formatWeight(summary?.zakat_fitrah_rice_kg || 0)}
              icon={Wheat}
              variant="success"
            />
            <StatCard
              title="Zakat Mal"
              value={formatCurrency(summary?.zakat_mal || 0)}
              icon={TrendingUp}
              variant="success"
            />
            <StatCard
              title="Fidyah (Uang)"
              value={formatCurrency(summary?.fidyah_cash || 0)}
              icon={HandHeart}
              variant="warning"
            />
            <StatCard
              title="Fidyah (Makanan)"
              value={formatWeight(summary?.fidyah_food_kg || 0)}
              icon={Package}
              variant="warning"
            />
          </div>
        </div>

        {/* Total Summary Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700">Total Kas Terkumpul</p>
                  <p className="text-2xl font-bold text-green-800">
                    {formatCurrency(totalCollectedCash)}
                  </p>
                </div>
                <Coins className="h-10 w-10 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700">Total Beras Terkumpul</p>
                  <p className="text-2xl font-bold text-amber-800">
                    {formatWeight(totalCollectedRice)}
                  </p>
                </div>
                <Wheat className="h-10 w-10 text-amber-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-700">Total Muzakki</p>
                  <p className="text-2xl font-bold text-blue-800">
                    {summary?.total_muzakki || 0} orang
                  </p>
                </div>
                <Users className="h-10 w-10 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-700">Total Pendistribusian</p>
                  <p className="text-2xl font-bold text-purple-800">{summary?.total_distributions || 0} penerima</p>
                </div>
                <ArrowDownCircle className="h-10 w-10 text-purple-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div>
          <FundComparisonChart data={comparison} isLoading={comparisonLoading} />
        </div>

        {/* Data Table & Export */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MemberZakatTable
              data={memberData || []}
              periodName={currentPeriod?.name || ""}
              isLoading={memberLoading}
            />
          </div>
          <div>
            <PeriodSummaryExport summary={summary} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
