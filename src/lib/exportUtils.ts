import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { MASJID_ADDRESS, MASJID_NAME } from "@/lib/masjidProfile";

/* ------------------------------------------------------------------ */
/* Formatter dasar                                                     */
/* ------------------------------------------------------------------ */

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

/** Rp tanpa non-breaking space, supaya aman dirender font standar PDF. */
const formatCurrencyPlain = (value: number): string =>
  `Rp ${Math.round(value).toLocaleString("id-ID")}`;

const formatNumberPlain = (value: number): string =>
  Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ */
/* Tipe dokumen laporan                                                */
/* ------------------------------------------------------------------ */

export type ReportValueFormat = "text" | "currency" | "weight" | "number" | "date";
export type ReportAlign = "left" | "right" | "center";

export interface ReportColumn {
  header: string;
  key: string;
  /** Menentukan cara nilai dirender di PDF sekaligus format angka di Excel. */
  format?: ReportValueFormat;
  align?: ReportAlign;
  /** Lebar kolom Excel (karakter). */
  width?: number;
  /** Lebar kolom PDF (mm). Sisa ruang dibagi rata ke kolom tanpa lebar. */
  pdfWidth?: number;
  /** Ikut dijumlahkan pada baris total. */
  total?: boolean;
}

export interface ReportTableSection {
  type: "table";
  title: string;
  note?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  showTotals?: boolean;
  emptyMessage?: string;
}

export interface ReportStatsSection {
  type: "stats";
  title: string;
  note?: string;
  items: { label: string; value: string; hint?: string }[];
}

export interface ReportDocument {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  sections: (ReportTableSection | ReportStatsSection)[];
  signatures?: { role: string; name?: string }[];
  orientation?: "portrait" | "landscape";
  notes?: string[];
}

/* ------------------------------------------------------------------ */
/* Helper nilai                                                        */
/* ------------------------------------------------------------------ */

const isBlank = (value: unknown) => value === null || value === undefined || value === "";

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const isNumericFormat = (format?: ReportValueFormat) =>
  format === "currency" || format === "weight" || format === "number";

/** Nilai siap tampil untuk PDF. `dashOnZero` menyamakan tampilannya dengan tabel di layar. */
const renderValue = (value: unknown, format?: ReportValueFormat, dashOnZero = false): string => {
  if (isBlank(value)) return isNumericFormat(format) ? (dashOnZero ? "-" : formatValueByFormat(0, format)) : "-";
  if (isNumericFormat(format)) {
    const numeric = toNumber(value);
    if (dashOnZero && numeric === 0) return "-";
    return formatValueByFormat(numeric, format);
  }
  if (format === "date") return typeof value === "string" ? value : String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return formatNumberPlain(value);
  return String(value);
};

function formatValueByFormat(value: number, format?: ReportValueFormat): string {
  if (format === "currency") return formatCurrencyPlain(value);
  if (format === "weight") return `${formatNumberPlain(value)} kg`;
  return formatNumberPlain(value);
}

const columnAlign = (column: ReportColumn): ReportAlign =>
  column.align || (isNumericFormat(column.format) ? "right" : "left");

const computeTotals = (section: ReportTableSection): Record<string, number> | null => {
  if (!section.showTotals) return null;
  const totalColumns = section.columns.filter((column) => column.total);
  if (totalColumns.length === 0) return null;

  const totals: Record<string, number> = {};
  totalColumns.forEach((column) => {
    totals[column.key] = section.rows.reduce((sum, row) => sum + toNumber(row[column.key]), 0);
  });
  return totals;
};

/* ------------------------------------------------------------------ */
/* Render PDF                                                          */
/* ------------------------------------------------------------------ */

const BRAND: [number, number, number] = [37, 167, 119];
const BRAND_DARK: [number, number, number] = [23, 112, 80];
const INK: [number, number, number] = [24, 32, 44];
const MUTED: [number, number, number] = [112, 122, 136];
const HAIRLINE: [number, number, number] = [225, 231, 238];
const SOFT: [number, number, number] = [244, 248, 250];

/** jsPDF memakai font standar Latin-1, jadi karakter di luar itu diganti padanannya. */
const pdfText = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\xFF]/g, "");

export function exportReportToPDF(report: ReportDocument, filename: string) {
  const orientation = report.orientation || "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 18;

  const printedAt = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });

  /* --- kop surat --- */
  const drawLetterhead = (): number => {
    const bandHeight = 24;
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, bandHeight, "F");
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, bandHeight, pageWidth, 1.4, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(pdfText(MASJID_NAME), margin, 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    const addressLines = doc.splitTextToSize(pdfText(MASJID_ADDRESS), contentWidth * 0.55);
    doc.text(addressLines.slice(0, 2), margin, 15);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(pdfText(report.title), pageWidth - margin, 10, { align: "right" });
    if (report.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(pdfText(report.subtitle), pageWidth - margin, 15.5, { align: "right" });
    }

    return bandHeight + 8;
  };

  let cursorY = drawLetterhead();

  const addPage = () => {
    doc.addPage();
    cursorY = drawLetterhead();
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > bottomLimit) addPage();
  };

  /* --- baris meta --- */
  if (report.meta && report.meta.length > 0) {
    const metaLine = report.meta.map((item) => `${item.label}: ${item.value}`).join("   |   ");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    const metaLines = doc.splitTextToSize(pdfText(metaLine), contentWidth);
    doc.text(metaLines, margin, cursorY);
    cursorY += metaLines.length * 4 + 2;
  }

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  const drawSectionTitle = (title: string, note?: string) => {
    ensureSpace(note ? 14 : 10);
    doc.setFillColor(...BRAND);
    doc.roundedRect(margin, cursorY - 3.4, 2.2, 4.8, 1, 1, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(pdfText(title), margin + 5, cursorY);
    cursorY += 4.6;

    if (note) {
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      const noteLines = doc.splitTextToSize(pdfText(note), contentWidth - 5);
      doc.text(noteLines, margin + 5, cursorY);
      cursorY += noteLines.length * 3.6;
    }

    cursorY += 2.5;
  };

  const drawStats = (section: ReportStatsSection) => {
    drawSectionTitle(section.title, section.note);

    const perRow = section.items.length <= 3 ? section.items.length || 1 : orientation === "landscape" ? 5 : 3;
    const gap = 3.5;
    const boxWidth = (contentWidth - gap * (perRow - 1)) / perRow;
    const boxHeight = 17;

    section.items.forEach((item, index) => {
      const column = index % perRow;
      if (column === 0) ensureSpace(boxHeight + gap);

      const x = margin + column * (boxWidth + gap);
      const y = cursorY;

      doc.setFillColor(...SOFT);
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, "FD");

      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(pdfText(item.label.toUpperCase()), x + 3.5, y + 5.4, { maxWidth: boxWidth - 7 });

      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(item.value.length > 15 ? 9 : 11);
      doc.text(pdfText(item.value), x + 3.5, y + 11.4, { maxWidth: boxWidth - 7 });

      if (item.hint) {
        doc.setTextColor(...MUTED);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.6);
        doc.text(pdfText(item.hint), x + 3.5, y + 15, { maxWidth: boxWidth - 7 });
      }

      if (column === perRow - 1 || index === section.items.length - 1) {
        cursorY += boxHeight + gap;
      }
    });

    cursorY += 3;
  };

  const drawTable = (section: ReportTableSection) => {
    drawSectionTitle(section.title, section.note);

    if (section.rows.length === 0) {
      ensureSpace(12);
      doc.setFillColor(...SOFT);
      doc.setDrawColor(...HAIRLINE);
      doc.roundedRect(margin, cursorY, contentWidth, 10, 2, 2, "FD");
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text(pdfText(section.emptyMessage || "Tidak ada data."), margin + 4, cursorY + 6.4);
      cursorY += 16;
      return;
    }

    const totals = computeTotals(section);
    const columnStyles: Record<number, { halign: ReportAlign; cellWidth?: number }> = {};
    section.columns.forEach((column, index) => {
      columnStyles[index] = {
        halign: columnAlign(column),
        ...(column.pdfWidth ? { cellWidth: column.pdfWidth } : {}),
      };
    });

    autoTable(doc, {
      head: [section.columns.map((column) => pdfText(column.header))],
      body: section.rows.map((row) =>
        section.columns.map((column) => pdfText(renderValue(row[column.key], column.format, true))),
      ),
      foot: totals
        ? [
            section.columns.map((column, index) => {
              if (index === 0) return "TOTAL";
              if (totals[column.key] === undefined) return "";
              return pdfText(formatValueByFormat(totals[column.key], column.format));
            }),
          ]
        : undefined,
      startY: cursorY,
      margin: { top: 34, left: margin, right: margin, bottom: 18 },
      theme: "grid",
      // Baris TOTAL hanya muncul sekali di akhir tabel, bukan di tiap halaman.
      showFoot: "lastPage",
      showHead: "everyPage",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 2.4, right: 2.4 },
        lineColor: HAIRLINE,
        lineWidth: 0.2,
        textColor: INK,
        overflow: "linebreak",
      },
      // Tanpa halign di sini supaya header mengikuti perataan kolomnya (angka rata kanan).
      headStyles: {
        fillColor: BRAND,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        lineColor: BRAND,
      },
      footStyles: {
        fillColor: SOFT,
        textColor: INK,
        fontStyle: "bold",
        fontSize: 8,
        lineColor: HAIRLINE,
      },
      alternateRowStyles: { fillColor: [250, 252, 253] },
      columnStyles,
      // Halaman baru akibat page-break tabel tetap memakai kop surat.
      didDrawPage: () => {
        drawLetterhead();
      },
    });

    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
    cursorY = (lastTable?.finalY ?? cursorY) + 8;
  };

  report.sections.forEach((section) => {
    if (section.type === "stats") drawStats(section);
    else drawTable(section);
  });

  /* --- catatan --- */
  if (report.notes && report.notes.length > 0) {
    ensureSpace(8 + report.notes.length * 4);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.6);
    report.notes.forEach((note) => {
      const lines = doc.splitTextToSize(pdfText(`* ${note}`), contentWidth);
      doc.text(lines, margin, cursorY);
      cursorY += lines.length * 3.6;
    });
    cursorY += 4;
  }

  /* --- tanda tangan --- */
  if (report.signatures && report.signatures.length > 0) {
    const blockHeight = 34;
    ensureSpace(blockHeight);

    const perRow = report.signatures.length;
    const slot = contentWidth / perRow;

    doc.setTextColor(...INK);
    report.signatures.forEach((signature, index) => {
      const centerX = margin + slot * index + slot / 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(pdfText(signature.role), centerX, cursorY + 5, { align: "center" });

      doc.setDrawColor(...HAIRLINE);
      doc.line(centerX - slot * 0.32, cursorY + 24, centerX + slot * 0.32, cursorY + 24);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(pdfText(signature.name || "(....................................)"), centerX, cursorY + 28.5, {
        align: "center",
      });
    });

    cursorY += blockHeight;
  }

  /* --- footer semua halaman --- */
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(pdfText(`${MASJID_NAME} - ${report.title}`), margin, pageHeight - 7.5);
    doc.text(pdfText(`Dicetak ${printedAt}`), pageWidth / 2, pageHeight - 7.5, { align: "center" });
    doc.text(`Hal. ${page}/${pageCount}`, pageWidth - margin, pageHeight - 7.5, { align: "right" });
  }

  doc.save(`${filename}.pdf`);
}

/* ------------------------------------------------------------------ */
/* Render Excel                                                        */
/* ------------------------------------------------------------------ */

type WorksheetCell = string | number | boolean | null;

const EXCEL_FORMATS: Record<string, string> = {
  currency: '"Rp" #,##0',
  weight: '#,##0.00" kg"',
  number: "#,##0",
};

const sanitizeSheetName = (name: string, used: Set<string>): string => {
  const base = (name || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 26)} ${counter}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

const buildTableSheet = (
  section: ReportTableSection,
  report: ReportDocument,
): XLSX.WorkSheet => {
  const headerRows: WorksheetCell[][] = [
    [MASJID_NAME],
    [MASJID_ADDRESS],
    [report.title],
    [report.subtitle || ""],
    [section.title],
    [
      report.meta && report.meta.length > 0
        ? report.meta.map((item) => `${item.label}: ${item.value}`).join(" | ")
        : "",
    ],
    [],
  ];

  const columnHeaderRowIndex = headerRows.length; // 0-based
  const aoa: WorksheetCell[][] = [
    ...headerRows,
    section.columns.map((column) => column.header),
    ...section.rows.map((row) =>
      section.columns.map((column) => {
        const value = row[column.key];
        if (isNumericFormat(column.format)) return toNumber(value);
        if (isBlank(value)) return "";
        if (typeof value === "boolean") return value ? "Ya" : "Tidak";
        if (typeof value === "number") return value;
        return String(value);
      }),
    ),
  ];

  const totals = computeTotals(section);
  if (totals) {
    aoa.push(
      section.columns.map((column, index) => {
        if (index === 0) return "TOTAL";
        if (totals[column.key] === undefined) return "";
        return totals[column.key];
      }),
    );
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Format angka per kolom supaya bisa langsung dijumlahkan di Excel.
  const firstDataRow = columnHeaderRowIndex + 1;
  const lastDataRow = firstDataRow + section.rows.length - 1 + (totals ? 1 : 0);

  section.columns.forEach((column, columnIndex) => {
    const numberFormat = column.format ? EXCEL_FORMATS[column.format] : undefined;
    if (!numberFormat) return;

    for (let rowIndex = firstDataRow; rowIndex <= lastDataRow; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address] as XLSX.CellObject | undefined;
      if (cell && cell.t === "n") cell.z = numberFormat;
    }
  });

  worksheet["!cols"] = section.columns.map((column) => ({
    wch: column.width || Math.max(12, Math.min(38, column.header.length + 6)),
  }));

  const lastColumn = Math.max(0, section.columns.length - 1);
  worksheet["!merges"] = headerRows
    .map((_, index) => index)
    .filter((index) => index < 6)
    .map((index) => ({ s: { r: index, c: 0 }, e: { r: index, c: lastColumn } }));

  if (section.rows.length > 0) {
    worksheet["!autofilter"] = {
      ref: `${XLSX.utils.encode_cell({ r: columnHeaderRowIndex, c: 0 })}:${XLSX.utils.encode_cell({
        r: columnHeaderRowIndex + section.rows.length,
        c: lastColumn,
      })}`,
    };
  }

  return worksheet;
};

const buildStatsSheet = (section: ReportStatsSection, report: ReportDocument): XLSX.WorkSheet => {
  const aoa: WorksheetCell[][] = [
    [MASJID_NAME],
    [MASJID_ADDRESS],
    [report.title],
    [report.subtitle || ""],
    [section.title],
    [],
    ["Keterangan", "Nilai", "Catatan"],
    ...section.items.map((item) => [item.label, item.value, item.hint || ""]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = [{ wch: 34 }, { wch: 26 }, { wch: 40 }];
  worksheet["!merges"] = [0, 1, 2, 3, 4].map((index) => ({
    s: { r: index, c: 0 },
    e: { r: index, c: 2 },
  }));

  return worksheet;
};

export function exportReportToExcel(report: ReportDocument, filename: string) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  report.sections.forEach((section) => {
    const worksheet =
      section.type === "stats" ? buildStatsSheet(section, report) : buildTableSheet(section, report);
    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(section.title, usedNames));
  });

  if (report.sections.length === 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([[report.title], ["Tidak ada data."]]),
      "Kosong",
    );
  }

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* API lama - tetap dipakai halaman lain, kini memakai mesin baru      */
/* ------------------------------------------------------------------ */

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

const legacyToReport = (data: ExportData): ReportDocument => {
  const sections: ReportDocument["sections"] = [
    {
      type: "table",
      title: data.title,
      columns: data.columns.map((column) => ({
        header: column.header,
        key: column.key,
        width: column.width,
      })),
      rows: data.rows,
    },
  ];

  if (data.summary && Object.keys(data.summary).length > 0) {
    sections.unshift({
      type: "stats",
      title: "Ringkasan",
      items: Object.entries(data.summary).map(([label, value]) => ({
        label,
        value: typeof value === "number" ? formatNumberPlain(value) : String(value),
      })),
    });
  }

  return {
    title: data.title,
    subtitle: data.subtitle,
    meta: data.subtitle ? [{ label: "Periode", value: data.subtitle }] : undefined,
    sections,
  };
};

export function exportToPDF(data: ExportData, filename: string) {
  exportReportToPDF(legacyToReport(data), filename);
}

export function exportToExcel(data: ExportData, filename: string) {
  exportReportToExcel(legacyToReport(data), filename);
}
