import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { MASJID_ADDRESS, MASJID_NAME } from "@/lib/masjidProfile";

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportData {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  summary?: Record<string, string | number>;
}

type WorksheetCell = string | number | boolean | null;

const toDisplayString = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return value.toLocaleString("id-ID");
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
};

const toWorksheetCell = (value: unknown): WorksheetCell => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
};

export function exportToPDF(data: ExportData, filename: string) {
  const doc = new jsPDF();
  let currentY = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.title, 14, currentY);
  currentY += 8;

  if (MASJID_NAME) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(MASJID_NAME, 14, currentY);
    currentY += 6;
  }

  if (MASJID_ADDRESS) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const addressLines = doc.splitTextToSize(MASJID_ADDRESS, 180);
    doc.text(addressLines, 14, currentY);
    currentY += addressLines.length * 5;
  }

  // Subtitle
  if (data.subtitle) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(data.subtitle, 14, currentY);
    currentY += 7;
  }

  // Table
  const tableData = data.rows.map((row) =>
    data.columns.map((col) => {
      return toDisplayString(row[col.key]);
    })
  );

  autoTable(doc, {
    head: [data.columns.map((col) => col.header)],
    body: tableData,
    startY: currentY + 2,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [34, 139, 98], // Primary green
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
  });

  // Summary section
  if (data.summary) {
    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 50;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Ringkasan:", 14, finalY + 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let yPos = finalY + 22;
    Object.entries(data.summary).forEach(([key, value]) => {
      doc.text(`${key}: ${value}`, 14, yPos);
      yPos += 6;
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Halaman ${i} dari ${pageCount} | Dicetak: ${new Date().toLocaleDateString("id-ID")}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  doc.save(`${filename}.pdf`);
}

export function exportToExcel(data: ExportData, filename: string) {
  // Prepare worksheet data
  const wsData: WorksheetCell[][] = [];

  // Title row
  wsData.push([data.title]);
  if (MASJID_NAME) {
    wsData.push([MASJID_NAME]);
  }
  if (MASJID_ADDRESS) {
    wsData.push([MASJID_ADDRESS]);
  }
  if (data.subtitle) {
    wsData.push([data.subtitle]);
  }
  wsData.push([]); // Empty row

  // Headers
  wsData.push(data.columns.map((col) => col.header));

  // Data rows
  data.rows.forEach((row) => {
    wsData.push(
      data.columns.map((col) => {
        return toWorksheetCell(row[col.key]);
      })
    );
  });

  // Summary section
  if (data.summary) {
    wsData.push([]); // Empty row
    wsData.push(["Ringkasan"]);
    Object.entries(data.summary).forEach(([key, value]) => {
      wsData.push([key, value]);
    });
  }

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = data.columns.map((col) => ({
    wch: col.width || 15,
  }));
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatWeight(value: number, unit: string = "kg"): string {
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${unit}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
