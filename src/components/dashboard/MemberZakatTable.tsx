import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { useState } from "react";
import { MemberZakatData } from "@/hooks/useDashboardData";
import { exportToPDF, exportToExcel, formatCurrency, formatWeight, formatDate } from "@/lib/exportUtils";

const RELATIONSHIP_LABELS: Record<string, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

interface MemberZakatTableProps {
  data: MemberZakatData[];
  periodName: string;
  isLoading?: boolean;
}

export function MemberZakatTable({
  data,
  periodName,
  isLoading,
}: MemberZakatTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = data.filter(
    (item) =>
      item.member_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.muzakki_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalRice = filteredData.reduce((sum, item) => sum + (item.paid_rice_kg || 0), 0);
  const totalMoney = filteredData.reduce((sum, item) => sum + (item.paid_money || 0), 0);

  const handleExportPDF = () => {
    exportToPDF(
      {
        title: "Laporan Zakat Fitrah Per Anggota",
        subtitle: `Periode: ${periodName}`,
        columns: [
          { header: "Nama Anggota", key: "member_name", width: 20 },
          { header: "Nama Muzakki", key: "muzakki_name", width: 20 },
          { header: "Hubungan", key: "relationship_label", width: 15 },
          { header: "Beras (kg)", key: "paid_rice_kg", width: 12 },
          { header: "Uang (Rp)", key: "paid_money", width: 15 },
          { header: "Tanggal", key: "transaction_date_formatted", width: 12 },
        ],
        rows: filteredData.map((item) => ({
          ...item,
          relationship_label: RELATIONSHIP_LABELS[item.relationship] || item.relationship,
          paid_rice_kg: item.paid_rice_kg || 0,
          paid_money: item.paid_money || 0,
          transaction_date_formatted: formatDate(item.transaction_date),
        })),
        summary: {
          "Total Anggota": filteredData.length,
          "Total Beras": formatWeight(
            filteredData.reduce((sum, item) => sum + (item.paid_rice_kg || 0), 0)
          ),
          "Total Uang": formatCurrency(
            filteredData.reduce((sum, item) => sum + (item.paid_money || 0), 0)
          ),
        },
      },
      `zakat-fitrah-anggota-${periodName}`
    );
  };

  const handleExportExcel = () => {
    exportToExcel(
      {
        title: "Laporan Zakat Fitrah Per Anggota",
        subtitle: `Periode: ${periodName}`,
        columns: [
          { header: "Nama Anggota", key: "member_name", width: 25 },
          { header: "Nama Muzakki", key: "muzakki_name", width: 25 },
          { header: "Hubungan", key: "relationship_label", width: 18 },
          { header: "Beras (kg)", key: "paid_rice_kg", width: 12 },
          { header: "Uang (Rp)", key: "paid_money", width: 18 },
          { header: "Tanggal", key: "transaction_date_formatted", width: 15 },
        ],
        rows: filteredData.map((item) => ({
          ...item,
          relationship_label: RELATIONSHIP_LABELS[item.relationship] || item.relationship,
          paid_rice_kg: item.paid_rice_kg || 0,
          paid_money: item.paid_money || 0,
          transaction_date_formatted: formatDate(item.transaction_date),
        })),
        summary: {
          "Total Anggota": filteredData.length,
          "Total Beras (kg)": filteredData.reduce(
            (sum, item) => sum + (item.paid_rice_kg || 0),
            0
          ),
          "Total Uang (Rp)": filteredData.reduce(
            (sum, item) => sum + (item.paid_money || 0),
            0
          ),
        },
      },
      `zakat-fitrah-anggota-${periodName}`
    );
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base sm:text-lg">Data Zakat Fitrah Per Anggota</CardTitle>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Riwayat pembayaran anggota keluarga per periode terpilih.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative w-full sm:w-[230px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama anggota/muzakki..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-xs sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="flex-1 sm:flex-none">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="flex-1 sm:flex-none">
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                Excel
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLoading && filteredData.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Total Anggota</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold">{filteredData.length} data</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Total Beras</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold">{formatWeight(totalRice)}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Total Uang</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold">{formatCurrency(totalMoney)}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">Memuat data...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">Tidak ada data</p>
          </div>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Nama Anggota</TableHead>
                <TableHead className="whitespace-nowrap">Nama Muzakki</TableHead>
                <TableHead className="whitespace-nowrap">Hubungan</TableHead>
                <TableHead className="whitespace-nowrap text-right">Beras (kg)</TableHead>
                <TableHead className="whitespace-nowrap text-right">Uang (Rp)</TableHead>
                <TableHead className="whitespace-nowrap">Tanggal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.slice(0, 10).map((item, index) => (
                <TableRow key={`${item.member_id}-${index}`}>
                  <TableCell className="max-w-[200px] truncate text-[13px] font-medium">
                    {item.member_name}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-[13px]">{item.muzakki_name}</TableCell>
                  <TableCell className="text-[13px]">
                    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-1 text-[11px]">
                      {RELATIONSHIP_LABELS[item.relationship] || item.relationship}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-[13px]">
                    {item.paid_rice_kg ? formatWeight(item.paid_rice_kg) : "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-[13px]">
                    {item.paid_money ? formatCurrency(item.paid_money) : "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px]">{formatDate(item.transaction_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {filteredData.length > 10 && (
          <p className="text-center text-xs text-muted-foreground sm:text-sm">
            Menampilkan 10 dari {filteredData.length} data. Export untuk melihat semua.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
