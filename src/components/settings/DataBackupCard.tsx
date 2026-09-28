import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  buildBackupFileName,
  buildSqlBackup,
  getBackupStats,
  type BackupPayload,
} from "@/lib/sqlBackup";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, DatabaseBackup, Download, Loader2, RotateCcw, ShieldCheck } from "lucide-react";

type ResetScope = "transactions" | "all";

const RESET_CONFIRM_PHRASE = "RESET DATA";

const SCOPE_INFO: Record<ResetScope, { label: string; detail: string }> = {
  transactions: {
    label: "Hanya data transaksi",
    detail:
      "Menghapus transaksi zakat fitrah, zakat mal, fidyah, seluruh penyaluran, batch perhitungan, dan buku kas. Periode, muzakki, mustahik, serta pengaturan asnaf tetap ada.",
  },
  all: {
    label: "Transaksi + data master",
    detail:
      "Semua yang di atas, ditambah data muzakki beserta anggotanya, data mustahik, dan seluruh periode. Hanya akun login dan pengaturan asnaf yang dipertahankan.",
  },
};

/** Unduh isi teks sebagai berkas di perangkat pengguna. */
const downloadTextFile = (fileName: string, content: string) => {
  const blob = new Blob([content], { type: "application/sql;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export function DataBackupCard({ authorEmail }: { authorEmail?: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastBackup, setLastBackup] = useState<{ fileName: string; totalRows: number } | null>(null);

  const [resetScope, setResetScope] = useState<ResetScope>("transactions");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [hasBackupAcknowledged, setHasBackupAcknowledged] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.rpc("export_all_data");
      if (error) throw error;

      const payload = data as unknown as BackupPayload;
      const stats = getBackupStats(payload);
      const fileName = buildBackupFileName();

      downloadTextFile(fileName, buildSqlBackup(payload, { author: authorEmail || undefined }));
      setLastBackup({ fileName, totalRows: stats.totalRows });

      toast({
        title: "Cadangan berhasil diunduh",
        description: `${stats.totalRows.toLocaleString("id-ID")} baris tersimpan di ${fileName}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal membuat cadangan",
        description: error instanceof Error ? error.message : "Terjadi kesalahan tidak terduga",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const closeResetDialog = () => {
    setIsResetDialogOpen(false);
    setConfirmPhrase("");
    setHasBackupAcknowledged(false);
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_all_data", { _scope: resetScope });
      if (error) throw error;

      const deleted = (data as unknown as { deleted?: Record<string, number> })?.deleted || {};
      const totalDeleted = Object.values(deleted).reduce((sum, value) => sum + Number(value || 0), 0);

      await queryClient.invalidateQueries();

      toast({
        title: "Data berhasil direset",
        description: `${totalDeleted.toLocaleString("id-ID")} baris dihapus.`,
      });
      closeResetDialog();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal mereset data",
        description: error instanceof Error ? error.message : "Terjadi kesalahan tidak terduga",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const isConfirmValid = confirmPhrase.trim().toUpperCase() === RESET_CONFIRM_PHRASE && hasBackupAcknowledged;

  return (
    <>
      <Card className="border-border/70 lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseBackup className="h-4 w-4 text-primary" />
            Cadangan &amp; reset data
          </CardTitle>
          <CardDescription>
            Khusus super admin. Unduh seluruh data sebagai berkas SQL, atau kosongkan data untuk memulai periode baru.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Cadangan */}
          <div className="rounded-2xl border border-border/60 bg-muted/25 p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Unduh cadangan (.sql)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Berisi seluruh isi tabel dalam bentuk perintah INSERT. Jalankan di SQL Editor Supabase untuk
                  memulihkan data setelah reset.
                </p>
                {lastBackup && (
                  <Badge variant="outline" className="mt-2 rounded-full border-emerald-300 bg-emerald-50 text-emerald-700">
                    Terakhir: {lastBackup.fileName} · {lastBackup.totalRows.toLocaleString("id-ID")} baris
                  </Badge>
                )}
              </div>
              <Button onClick={handleExport} disabled={isExporting} className="shrink-0 gap-2 rounded-xl">
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isExporting ? "Menyiapkan..." : "Unduh Backup SQL"}
              </Button>
            </div>
          </div>

          {/* Zona berbahaya */}
          <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Zona berbahaya — reset data
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Penghapusan bersifat permanen dan tidak bisa dibatalkan. Unduh cadangan terlebih dahulu.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="reset-scope" className="text-xs">
                  Cakupan reset
                </Label>
                <Select value={resetScope} onValueChange={(value) => setResetScope(value as ResetScope)}>
                  <SelectTrigger id="reset-scope" className="h-10 rounded-xl bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transactions">{SCOPE_INFO.transactions.label}</SelectItem>
                    <SelectItem value="all">{SCOPE_INFO.all.label}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="destructive"
                className="gap-2 rounded-xl"
                onClick={() => setIsResetDialogOpen(true)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset Data
              </Button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{SCOPE_INFO[resetScope].detail}</p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isResetDialogOpen} onOpenChange={(open) => (open ? setIsResetDialogOpen(true) : closeResetDialog())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reset data permanen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>{SCOPE_INFO[resetScope].detail}</p>
                <p className="font-medium text-foreground">
                  Tindakan ini tidak dapat dibatalkan. Pastikan berkas cadangan sudah tersimpan di tempat aman.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-muted/25 p-3">
              <Checkbox
                checked={hasBackupAcknowledged}
                onCheckedChange={(checked) => setHasBackupAcknowledged(checked === true)}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed">
                Saya sudah mengunduh berkas cadangan SQL dan memahami data akan dihapus permanen.
              </span>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm" className="text-xs">
                Ketik <span className="font-mono font-semibold">{RESET_CONFIRM_PHRASE}</span> untuk melanjutkan
              </Label>
              <Input
                id="reset-confirm"
                value={confirmPhrase}
                onChange={(event) => setConfirmPhrase(event.target.value)}
                placeholder={RESET_CONFIRM_PHRASE}
                className="h-10 rounded-xl font-mono"
                autoComplete="off"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isResetting}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!isConfirmValid || isResetting}
              onClick={(event) => {
                event.preventDefault();
                void handleReset();
              }}
            >
              {isResetting ? "Menghapus..." : "Hapus sekarang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
