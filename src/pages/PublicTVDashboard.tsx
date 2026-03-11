import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Wheat, 
  Banknote, 
  Calendar, 
  Users, 
  Package, 
  TrendingUp,
  RefreshCw
} from "lucide-react";
import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatNumber = (value: number, suffix: string = "") => {
  return `${value.toLocaleString("id-ID")}${suffix}`;
};

function usePublicDashboardData() {
  return useQuery({
    queryKey: ["public-tv-dashboard"],
    queryFn: async () => {
      // Get active period
      const { data: period, error: periodError } = await supabase
        .from("periods")
        .select("*")
        .eq("status", "active")
        .order("hijri_year", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (periodError) throw periodError;
      if (!period) return null;

      // Get fund balances
      const { data: balances, error: balanceError } = await supabase.rpc(
        "get_all_fund_balances",
        { _period_id: period.id }
      );

      if (balanceError) throw balanceError;
      const balanceRows = (balances || []) as FundBalance[];

      // Get total muzakki count
      const { count: muzakkiCount } = await supabase
        .from("zakat_fitrah_transactions")
        .select("muzakki_id", { count: "exact", head: true })
        .eq("period_id", period.id);

      // Get total distributions
      const { count: distributionCount } = await supabase
        .from("zakat_distributions")
        .select("id", { count: "exact", head: true })
        .eq("period_id", period.id)
        .eq("status", "distributed");

      // Get fidyah transactions count
      const { count: fidyahCount } = await supabase
        .from("fidyah_transactions")
        .select("id", { count: "exact", head: true })
        .eq("period_id", period.id);

      const zakatFitrahCash = balanceRows.find((b) => b.category === "zakat_fitrah_cash")?.total_cash || 0;
      const zakatFitrahRice = balanceRows.find((b) => b.category === "zakat_fitrah_rice")?.total_rice_kg || 0;
      const zakatMal = balanceRows.find((b) => b.category === "zakat_mal")?.total_cash || 0;
      const fidyahCash = balanceRows.find((b) => b.category === "fidyah_cash")?.total_cash || 0;
      const fidyahFood = balanceRows.find((b) => b.category === "fidyah_food")?.total_food_kg || 0;

      return {
        period,
        zakatFitrahCash,
        zakatFitrahRice,
        zakatMal,
        fidyahCash,
        fidyahFood,
        totalMuzakki: muzakkiCount || 0,
        totalDistributions: distributionCount || 0,
        totalFidyahTransactions: fidyahCount || 0,
        totalCash: zakatFitrahCash + zakatMal + fidyahCash,
      };
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

export default function PublicTVDashboard() {
  const { data, isLoading, dataUpdatedAt } = usePublicDashboardData();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex items-center justify-center">
        <div className="text-white text-4xl animate-pulse">Memuat data...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex items-center justify-center">
        <div className="text-white text-4xl text-center">
          <Calendar className="h-24 w-24 mx-auto mb-6 opacity-50" />
          <p>Tidak ada periode aktif</p>
        </div>
      </div>
    );
  }

  const pieData = [
    { name: "Zakat Fitrah", value: data.zakatFitrahCash, color: "#10b981" },
    { name: "Zakat Mal", value: data.zakatMal, color: "#3b82f6" },
    { name: "Fidyah", value: data.fidyahCash, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  const barData = [
    { name: "Beras", value: data.zakatFitrahRice, unit: "kg" },
    { name: "Makanan", value: data.fidyahFood, unit: "kg" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 p-6 text-white">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-5xl font-bold tracking-tight">Dashboard Zakat</h1>
          <p className="text-2xl text-emerald-200 mt-2">
            {data.period.name} ({data.period.hijri_year} H / {data.period.gregorian_year} M)
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-mono font-bold">
            {currentTime.toLocaleTimeString("id-ID")}
          </div>
          <div className="text-xl text-emerald-200">
            {currentTime.toLocaleDateString("id-ID", { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
          <div className="flex items-center gap-2 text-emerald-300 text-sm mt-2">
            <RefreshCw className="h-4 w-4" />
            Update: {new Date(dataUpdatedAt).toLocaleTimeString("id-ID")}
          </div>
        </div>
      </div>

      {/* Period Settings */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-white/10 border-white/20 backdrop-blur">
          <CardContent className="p-4 text-center">
            <Wheat className="h-10 w-10 mx-auto mb-2 text-amber-300" />
            <p className="text-emerald-200 text-lg">Beras per Jiwa</p>
            <p className="text-3xl font-bold">{data.period.rice_amount_per_person || 2.5} kg</p>
          </CardContent>
        </Card>
        <Card className="bg-white/10 border-white/20 backdrop-blur">
          <CardContent className="p-4 text-center">
            <Banknote className="h-10 w-10 mx-auto mb-2 text-green-300" />
            <p className="text-emerald-200 text-lg">Uang per Jiwa</p>
            <p className="text-3xl font-bold">{formatCurrency(data.period.cash_amount_per_person || 35000)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/10 border-white/20 backdrop-blur">
          <CardContent className="p-4 text-center">
            <Calendar className="h-10 w-10 mx-auto mb-2 text-orange-300" />
            <p className="text-emerald-200 text-lg">Fidyah per Hari</p>
            <p className="text-3xl font-bold">{formatCurrency(data.period.fidyah_daily_rate || 35000)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/10 border-white/20 backdrop-blur">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-10 w-10 mx-auto mb-2 text-yellow-300" />
            <p className="text-emerald-200 text-lg">Nisab Emas/gram</p>
            <p className="text-3xl font-bold">{formatCurrency(data.period.nisab_gold_price_per_gram || 1200000)}</p>
          </CardContent>
        </Card>
      </div>

      <Separator className="bg-white/20 mb-6" />

      {/* Main Stats */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Totals */}
        <div className="col-span-8 grid grid-cols-2 gap-4">
          {/* Total Cash */}
          <Card className="bg-gradient-to-br from-green-500/30 to-emerald-600/30 border-green-400/30 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-green-500/30 rounded-2xl">
                  <Banknote className="h-12 w-12 text-green-200" />
                </div>
                <div>
                  <p className="text-xl text-green-200">Total Penerimaan Uang</p>
                  <p className="text-4xl font-bold">{formatCurrency(data.totalCash)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="bg-white/10 rounded-lg p-2 text-center">
                  <p className="text-green-200">Fitrah</p>
                  <p className="font-bold">{formatCurrency(data.zakatFitrahCash)}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2 text-center">
                  <p className="text-blue-200">Mal</p>
                  <p className="font-bold">{formatCurrency(data.zakatMal)}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2 text-center">
                  <p className="text-amber-200">Fidyah</p>
                  <p className="font-bold">{formatCurrency(data.fidyahCash)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Rice */}
          <Card className="bg-gradient-to-br from-amber-500/30 to-orange-600/30 border-amber-400/30 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-amber-500/30 rounded-2xl">
                  <Wheat className="h-12 w-12 text-amber-200" />
                </div>
                <div>
                  <p className="text-xl text-amber-200">Total Penerimaan Beras</p>
                  <p className="text-4xl font-bold">{formatNumber(data.zakatFitrahRice, " kg")}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/10 rounded-lg p-2 text-center">
                  <p className="text-amber-200">Zakat Fitrah</p>
                  <p className="font-bold">{formatNumber(data.zakatFitrahRice, " kg")}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2 text-center">
                  <p className="text-orange-200">Fidyah Makanan</p>
                  <p className="font-bold">{formatNumber(data.fidyahFood, " kg")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Muzakki & Distributions */}
          <Card className="bg-gradient-to-br from-blue-500/30 to-indigo-600/30 border-blue-400/30 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-blue-500/30 rounded-2xl">
                  <Users className="h-12 w-12 text-blue-200" />
                </div>
                <div>
                  <p className="text-xl text-blue-200">Total Muzakki</p>
                  <p className="text-5xl font-bold">{data.totalMuzakki}</p>
                  <p className="text-blue-300">pembayar zakat</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/30 to-pink-600/30 border-purple-400/30 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-purple-500/30 rounded-2xl">
                  <Package className="h-12 w-12 text-purple-200" />
                </div>
                <div>
                  <p className="text-xl text-purple-200">Total Distribusi</p>
                  <p className="text-5xl font-bold">{data.totalDistributions}</p>
                  <p className="text-purple-300">penerima bantuan</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Charts */}
        <div className="col-span-4 space-y-4">
          {pieData.length > 0 && (
            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="p-4">
                <p className="text-xl font-semibold text-center mb-2">Komposisi Dana</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 text-sm">
                  {pieData.map((item, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span>{item.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {barData.some(d => d.value > 0) && (
            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="p-4">
                <p className="text-xl font-semibold text-center mb-2">Penerimaan Barang</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical">
                      <XAxis type="number" stroke="#fff" fontSize={12} />
                      <YAxis type="category" dataKey="name" stroke="#fff" fontSize={14} width={60} />
                      <Bar dataKey="value" fill="#10b981" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-emerald-300 text-lg">
        <p>Semoga Allah SWT menerima zakat dan amal ibadah kita semua. Aamiin.</p>
      </div>
    </div>
  );
}
