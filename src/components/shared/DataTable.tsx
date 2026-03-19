import { ReactNode, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Plus, FileText, FileSpreadsheet } from "lucide-react";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T, index: number) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  title: string;
  data: T[];
  columns: Column<T>[];
  toolbarExtra?: ReactNode;
  headerActions?: ReactNode;
  searchPlaceholder?: string;
  searchKey?: keyof T;
  onAdd?: () => void;
  addLabel?: string;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
  actions?: (item: T) => ReactNode;
  isReadOnly?: boolean;
}

export function DataTable<T extends { id: string }>({
  title,
  data,
  columns,
  toolbarExtra,
  headerActions,
  searchPlaceholder = "Cari...",
  searchKey,
  onAdd,
  addLabel = "Tambah",
  onExportPDF,
  onExportExcel,
  isLoading,
  emptyMessage = "Tidak ada data",
  actions,
  isReadOnly,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = searchKey
    ? data.filter((item) =>
        String(item[searchKey])
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : data;

  return (
    <Card className="border-border/60 bg-card/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:gap-4 sm:pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            Menampilkan {filteredData.length} dari {data.length} data
          </p>
        </div>
        {headerActions ? (
          <div className="w-full lg:w-auto">{headerActions}</div>
        ) : (
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {toolbarExtra}
            {searchKey && (
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full pl-9 text-xs sm:h-9 sm:w-[220px] sm:text-sm"
                />
              </div>
            )}
            {onExportPDF && (
              <Button variant="outline" size="sm" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={onExportPDF}>
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
            )}
            {onExportExcel && (
              <Button variant="outline" size="sm" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={onExportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel
              </Button>
            )}
            {onAdd && !isReadOnly && (
              <Button size="sm" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={onAdd}>
                <Plus className="mr-2 h-4 w-4" />
                {addLabel}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">Memuat data...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="rounded-xl">
            <Table className="min-w-[640px] sm:min-w-[720px]">
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={String(column.key)} className={column.className}>
                      {column.header}
                    </TableHead>
                  ))}
                  {actions && <TableHead className="w-[100px]">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item, index) => (
                  <TableRow key={item.id}>
                    {columns.map((column) => (
                      <TableCell key={String(column.key)} className={column.className}>
                        {column.render
                          ? column.render(item, index)
                          : String(item[column.key as keyof T] ?? "-")}
                      </TableCell>
                    ))}
                    {actions && <TableCell>{actions(item)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
