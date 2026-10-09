import { useState } from "react";
import { useServiceSession } from "@/hooks/useServiceSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DoorClosed, DoorOpen } from "lucide-react";

const formatTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

/** Mengubah input jam "19:30" menjadi timestamp hari ini. */
const timeInputToIso = (value: string): string | null => {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  return target.toISOString();
};

export function ServiceStatusCard({ isReadOnly }: { isReadOnly?: boolean }) {
  const { sessions, openSession, isOpen, openMutation, closeMutation } = useServiceSession();

  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [scheduledClose, setScheduledClose] = useState("");
  const [note, setNote] = useState("");

  const handleOpen = () => {
    openMutation.mutate(
      { scheduledCloseAt: timeInputToIso(scheduledClose), note },
      {
        onSuccess: () => {
          setIsOpenDialogOpen(false);
          setScheduledClose("");
          setNote("");
        },
      },
    );
  };

  return (
    <>
      <Card
        className={`border-border/70 shadow-sm transition-colors ${
          isOpen ? "border-emerald-500/30 bg-emerald-500/[0.05]" : ""
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span
                  className={`rounded-lg p-1.5 text-white shadow-md ${
                    isOpen
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-400 shadow-emerald-500/25"
                      : "bg-gradient-to-br from-slate-500 to-slate-400 shadow-slate-500/25"
                  }`}
                >
                  {isOpen ? <DoorOpen className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}
                </span>
                Status layanan
              </CardTitle>
              <CardDescription>Tampil langsung di papan monitoring /tv.</CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`gap-1.5 rounded-full ${
                isOpen
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-slate-50 text-slate-600"
              }`}
            >
              {isOpen && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-glow-pulse" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                </span>
              )}
              {isOpen ? "Sedang buka" : "Tutup"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
            {isOpen && openSession ? (
              <>
                <p className="text-sm font-semibold tabular-nums">
                  Buka sejak {formatTime(openSession.opened_at)}
                  {openSession.scheduled_close_at && ` · rencana tutup ${formatTime(openSession.scheduled_close_at)}`}
                </p>
                {openSession.note && <p className="mt-1 text-xs text-muted-foreground">{openSession.note}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Loket sedang tutup. Buka layanan agar jamaah tahu panitia siap menerima zakat.
              </p>
            )}
          </div>

          {sessions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sessions.map((session) => (
                <Badge key={session.id} variant="secondary" className="rounded-full text-[11px] tabular-nums">
                  {formatTime(session.opened_at)} – {session.closed_at ? formatTime(session.closed_at) : "sekarang"}
                </Badge>
              ))}
            </div>
          )}

          {!isReadOnly && (
            <div className="flex justify-end">
              {isOpen && openSession ? (
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl"
                  disabled={closeMutation.isPending}
                  onClick={() => closeMutation.mutate(openSession.id)}
                >
                  <DoorClosed className="h-4 w-4" />
                  {closeMutation.isPending ? "Menutup..." : "Tutup layanan"}
                </Button>
              ) : (
                <Button className="gap-2 rounded-xl" onClick={() => setIsOpenDialogOpen(true)}>
                  <DoorOpen className="h-4 w-4" />
                  Buka layanan
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isOpenDialogOpen} onOpenChange={setIsOpenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buka layanan</DialogTitle>
            <DialogDescription>
              Sesi dimulai sekarang. Isian di bawah bersifat opsional dan hanya untuk informasi di papan /tv.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="scheduled-close" className="text-xs">
                Rencana jam tutup
              </Label>
              <Input
                id="scheduled-close"
                type="time"
                value={scheduledClose}
                onChange={(event) => setScheduledClose(event.target.value)}
                className="h-11 rounded-xl tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-note" className="text-xs">
                Catatan
              </Label>
              <Input
                id="session-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Contoh: Sesi siang di teras masjid"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setIsOpenDialogOpen(false)}>
              Batal
            </Button>
            <Button className="rounded-xl" onClick={handleOpen} disabled={openMutation.isPending}>
              {openMutation.isPending ? "Membuka..." : "Buka sekarang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
