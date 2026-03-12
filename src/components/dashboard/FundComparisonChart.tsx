import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/exportUtils";

interface ComparisonData {
  zakatFitrahCash: number;
  zakatFitrahRice: number;
  zakatMal: number;
  fidyahCash: number;
  fidyahFood: number;
  totalZakat: number;
  totalFidyah: number;
}

interface FundComparisonChartProps {
  data: ComparisonData | null;
  isLoading?: boolean;
}

const COLORS = {
  zakatFitrahCash: "hsl(158, 64%, 40%)",
  zakatFitrahRice: "hsl(158, 64%, 55%)",
  zakatMal: "hsl(180, 64%, 40%)",
  fidyahCash: "hsl(38, 92%, 50%)",
  fidyahFood: "hsl(38, 72%, 60%)",
};

export function FundComparisonChart({
  data,
  isLoading,
}: FundComparisonChartProps) {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Perbandingan Penerimaan Zakat vs Fidyah</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[240px] items-center justify-center sm:h-[280px]">
          <p className="text-muted-foreground">Memuat data...</p>
        </CardContent>
      </Card>
    );
  }

  const barData = [
    {
      name: "ZF Uang",
      value: data.zakatFitrahCash,
      fill: COLORS.zakatFitrahCash,
    },
    {
      name: "Zakat Mal",
      value: data.zakatMal,
      fill: COLORS.zakatMal,
    },
    {
      name: "Fidyah Uang",
      value: data.fidyahCash,
      fill: COLORS.fidyahCash,
    },
  ];

  const pieData = [
    { name: "Total Zakat", value: data.totalZakat, fill: COLORS.zakatFitrahCash },
    { name: "Total Fidyah", value: data.totalFidyah, fill: COLORS.fidyahCash },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Perbandingan Dana Tunai</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(value) =>
                  new Intl.NumberFormat("id-ID", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(value)
                }
              />
              <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Komposisi Zakat vs Fidyah</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
