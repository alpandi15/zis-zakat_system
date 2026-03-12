import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, FileText } from "lucide-react";
import { PeriodSummary } from "@/hooks/useDashboardData";
import { exportToPDF, exportToExcel, formatCurrency, formatWeight } from "@/lib/exportUtils";

interface PeriodSummaryExportProps {
  summary: PeriodSummary | null;
}

export function PeriodSummaryExport({ summary }: PeriodSummaryExportProps) {
  if (!summary) return null;

  const handleExportPDF = () => {
    exportToPDF(
      {
        title: "Ringkasan Periode",
        subtitle: `${summary.period_name} (${summary.hijri_year}H / ${summary.gregorian_year}M)`,
        columns: [
          { header: "Kategori", key: "category", width: 30 },
          { header: "Nilai", key: "value", width: 25 },
        ],
        rows: [
          { category: "Zakat Fitrah (Uang)", value: formatCurrency(summary.zakat_fitrah_cash) },
          { category: "Zakat Fitrah (Beras)", value: formatWeight(summary.zakat_fitrah_rice_kg) },
          { category: "Zakat Mal", value: formatCurrency(summary.zakat_mal) },
          { category: "Fidyah (Uang)", value: formatCurrency(summary.fidyah_cash) },
          { category: "Fidyah (Makanan)", value: formatWeight(summary.fidyah_food_kg) },
          { category: "Total Uang Gabungan", value: formatCurrency(summary.total_combined_cash) },
          { category: "Total Muzakki (Kepala Keluarga)", value: summary.total_muzakki_households.toString() },
          { category: "Total Muzakki (Jiwa/Fitrah)", value: summary.total_jiwa_fitrah.toString() },
          { category: "Total Mustahik", value: summary.total_mustahik.toString() },
          { category: "Total Pendistribusian", value: summary.total_distributions.toString() },
        ],
        summary: {
          "Total Dana Zakat": formatCurrency(summary.zakat_fitrah_cash + summary.zakat_mal),
          "Total Dana Fidyah": formatCurrency(summary.fidyah_cash),
          "Total Uang Gabungan": formatCurrency(summary.total_combined_cash),
        },
      },
      `ringkasan-periode-${summary.period_name}`
    );
  };

  const handleExportExcel = () => {
    exportToExcel(
      {
        title: "Ringkasan Periode",
        subtitle: `${summary.period_name} (${summary.hijri_year}H / ${summary.gregorian_year}M)`,
        columns: [
          { header: "Kategori", key: "category", width: 30 },
          { header: "Nilai", key: "value", width: 25 },
        ],
        rows: [
          { category: "Zakat Fitrah (Uang)", value: summary.zakat_fitrah_cash },
          { category: "Zakat Fitrah (Beras) - kg", value: summary.zakat_fitrah_rice_kg },
          { category: "Zakat Mal", value: summary.zakat_mal },
          { category: "Fidyah (Uang)", value: summary.fidyah_cash },
          { category: "Fidyah (Makanan) - kg", value: summary.fidyah_food_kg },
          { category: "Total Uang Gabungan", value: summary.total_combined_cash },
          { category: "Total Muzakki (Kepala Keluarga)", value: summary.total_muzakki_households },
          { category: "Total Muzakki (Jiwa/Fitrah)", value: summary.total_jiwa_fitrah },
          { category: "Total Mustahik", value: summary.total_mustahik },
          { category: "Total Pendistribusian", value: summary.total_distributions },
        ],
        summary: {
          "Total Dana Zakat": summary.zakat_fitrah_cash + summary.zakat_mal,
          "Total Dana Fidyah": summary.fidyah_cash,
          "Total Uang Gabungan": summary.total_combined_cash,
        },
      },
      `ringkasan-periode-${summary.period_name}`
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Export Laporan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download ringkasan periode dalam format PDF atau Excel
        </p>
        <div className="flex gap-3">
          <Button onClick={handleExportPDF} className="flex-1">
            <FileText className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="flex-1">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download Excel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
