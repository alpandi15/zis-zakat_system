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
          <CardTitle className="text-lg">Perbandingan Zakat vs Fidyah</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Memuat data...</p>
        </CardContent>
      </Card>
    );
  }

  const barData = [
    {
      name: "Zakat Fitrah (Uang)",
      value: data.zakatFitrahCash,
      fill: COLORS.zakatFitrahCash,
    },
    {
      name: "Zakat Mal",
      value: data.zakatMal,
      fill: COLORS.zakatMal,
    },
    {
      name: "Fidyah (Uang)",
      value: data.fidyahCash,
      fill: COLORS.fidyahCash,
    },
  ];

  const pieData = [
    { name: "Total Zakat", value: data.totalZakat, fill: COLORS.zakatFitrahCash },
    { name: "Total Fidyah", value: data.totalFidyah, fill: COLORS.fidyahCash },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Perbandingan Dana (Uang)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value) =>
                  new Intl.NumberFormat("id-ID", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(value)
                }
              />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
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
        <CardHeader>
          <CardTitle className="text-lg">Distribusi Zakat vs Fidyah</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
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
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
