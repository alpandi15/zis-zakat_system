import { AppLayout } from "@/components/layout/AppLayout";
import { usePeriod } from "@/contexts/PeriodContext";
import { PeriodSummaryExport } from "@/components/dashboard/PeriodSummaryExport";
import { usePeriodSummary } from "@/hooks/useDashboardData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileBarChart } from "lucide-react";

export default function Reports() {
  const { selectedPeriod } = usePeriod();
  const { data: summary } = usePeriodSummary(selectedPeriod?.id || null);

  return (
    <AppLayout title="Laporan">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5" />
              Laporan Periode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Export laporan ringkasan penerimaan dan pendistribusian periode dalam format PDF atau Excel.
            </p>
          </CardContent>
        </Card>
        <PeriodSummaryExport summary={summary} />
      </div>
    </AppLayout>
  );
}
