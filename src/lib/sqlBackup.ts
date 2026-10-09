/**
 * Mengubah hasil RPC `export_all_data()` menjadi berkas .sql yang bisa dijalankan
 * ulang di SQL Editor Supabase untuk memulihkan data setelah reset.
 */

export interface BackupPayload {
  generated_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Urutan penulisan tabel mengikuti ketergantungan foreign key: tabel induk
 * ditulis lebih dulu supaya INSERT tidak ditolak.
 */
export const BACKUP_TABLE_ORDER = [
  "asnaf_settings",
  "profiles",
  "user_roles",
  "periods",
  "muzakki",
  "muzakki_members",
  "mustahik",
  "distribution_calculation_batches",
  "zakat_fitrah_transactions",
  "zakat_fitrah_transaction_items",
  "zakat_mal_transactions",
  "fidyah_transactions",
  "distribution_calculation_batch_items",
  "zakat_distributions",
  "fidyah_distributions",
  "distribution_assignments",
  "fund_ledger",
  "service_sessions",
] as const;

/** Jumlah baris per pernyataan INSERT supaya berkas tetap mudah dibaca. */
const ROWS_PER_STATEMENT = 200;

const quoteLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Mengubah satu nilai JSON menjadi literal SQL yang aman. */
export const toSqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";

  if (Array.isArray(value)) {
    if (value.length === 0) return "'{}'::text[]";
    return `ARRAY[${value.map((item) => quoteLiteral(String(item))).join(", ")}]::text[]`;
  }

  if (typeof value === "object") {
    return `${quoteLiteral(JSON.stringify(value))}::jsonb`;
  }

  return quoteLiteral(String(value));
};

/**
 * Baris diurutkan dari yang paling lama supaya referensi ke baris lain di tabel
 * yang sama (misalnya transaksi koreksi) sudah ada saat dipulihkan.
 */
const sortRowsForRestore = (rows: Record<string, unknown>[]): Record<string, unknown>[] => {
  if (rows.length === 0 || !("created_at" in rows[0])) return rows;

  return [...rows].sort((left, right) => {
    const leftTime = new Date(String(left.created_at ?? "")).getTime();
    const rightTime = new Date(String(right.created_at ?? "")).getTime();
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    return leftTime - rightTime;
  });
};

/** Gabungan seluruh nama kolom yang muncul pada baris-baris tabel. */
const collectColumns = (rows: Record<string, unknown>[]): string[] => {
  const columns: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!columns.includes(key)) columns.push(key);
    });
  });
  return columns;
};

const buildTableSection = (table: string, rows: Record<string, unknown>[]): string => {
  const lines: string[] = [];
  lines.push("-- ---------------------------------------------------------------------------");
  lines.push(`-- ${table} (${rows.length} baris)`);
  lines.push("-- ---------------------------------------------------------------------------");

  if (rows.length === 0) {
    lines.push("-- (kosong)");
    lines.push("");
    return lines.join("\n");
  }

  const ordered = sortRowsForRestore(rows);
  const columns = collectColumns(ordered);
  const columnList = columns.map(quoteIdentifier).join(", ");

  for (let index = 0; index < ordered.length; index += ROWS_PER_STATEMENT) {
    const chunk = ordered.slice(index, index + ROWS_PER_STATEMENT);
    const values = chunk
      .map((row) => `  (${columns.map((column) => toSqlLiteral(row[column])).join(", ")})`)
      .join(",\n");

    lines.push(`INSERT INTO public.${quoteIdentifier(table)} (${columnList}) VALUES`);
    lines.push(values);
    lines.push("ON CONFLICT DO NOTHING;");
    lines.push("");
  }

  return lines.join("\n");
};

export interface BackupStats {
  totalRows: number;
  perTable: { table: string; rows: number }[];
}

export const getBackupStats = (payload: BackupPayload): BackupStats => {
  const perTable = BACKUP_TABLE_ORDER.map((table) => ({
    table,
    rows: payload.tables?.[table]?.length ?? 0,
  }));

  return {
    perTable,
    totalRows: perTable.reduce((sum, item) => sum + item.rows, 0),
  };
};

/** Menyusun isi berkas .sql lengkap dengan header dan transaksi. */
export const buildSqlBackup = (payload: BackupPayload, options?: { author?: string }): string => {
  const generatedAt = payload.generated_at || new Date().toISOString();
  const stats = getBackupStats(payload);

  const header = [
    "-- =========================================================================",
    "-- Cadangan data AmanahZIS",
    `-- Dibuat pada : ${generatedAt}`,
    options?.author ? `-- Dibuat oleh : ${options.author}` : null,
    `-- Total baris : ${stats.totalRows}`,
    "--",
    "-- Cara memulihkan:",
    "--   1. Buka Supabase Dashboard > SQL Editor pada proyek tujuan.",
    "--   2. Pastikan seluruh migrasi skema sudah dijalankan.",
    "--   3. Tempel seluruh isi berkas ini lalu jalankan.",
    "--",
    "-- Catatan:",
    "--   * Berkas ini hanya berisi data, bukan struktur tabel.",
    "--   * ON CONFLICT DO NOTHING membuat berkas aman dijalankan berulang kali:",
    "--     baris yang sudah ada akan dilewati, bukan digandakan.",
    "--   * Tabel profiles dan user_roles mengacu ke auth.users. Bila dipulihkan ke",
    "--     proyek Supabase yang berbeda, buat dulu akun penggunanya.",
    "-- =========================================================================",
    "",
    "BEGIN;",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const body = BACKUP_TABLE_ORDER.map((table) =>
    buildTableSection(table, payload.tables?.[table] ?? []),
  ).join("\n");

  return `${header}${body}\nCOMMIT;\n`;
};

/** Nama berkas dengan stempel waktu lokal, misalnya amanahzis-backup-20260928-0930.sql */
export const buildBackupFileName = (date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
  return `amanahzis-backup-${stamp}.sql`;
};
