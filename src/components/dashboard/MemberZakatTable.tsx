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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Data Zakat Fitrah Per Anggota</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[200px] pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">Memuat data...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">Tidak ada data</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Anggota</TableHead>
                  <TableHead>Nama Muzakki</TableHead>
                  <TableHead>Hubungan</TableHead>
                  <TableHead className="text-right">Beras (kg)</TableHead>
                  <TableHead className="text-right">Uang (Rp)</TableHead>
                  <TableHead>Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.slice(0, 10).map((item, index) => (
                  <TableRow key={`${item.member_id}-${index}`}>
                    <TableCell className="font-medium">
                      {item.member_name}
                    </TableCell>
                    <TableCell>{item.muzakki_name}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs">
                        {RELATIONSHIP_LABELS[item.relationship] || item.relationship}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.paid_rice_kg ? formatWeight(item.paid_rice_kg) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.paid_money ? formatCurrency(item.paid_money) : "-"}
                    </TableCell>
                    <TableCell>{formatDate(item.transaction_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {filteredData.length > 10 && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Menampilkan 10 dari {filteredData.length} data. Export untuk melihat semua.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
