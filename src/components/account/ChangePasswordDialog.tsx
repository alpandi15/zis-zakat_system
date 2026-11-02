import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MIN_LENGTH = 6;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pengguna mengganti password akunnya sendiri setelah memverifikasi password lama. */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user?.email) {
      setError("Sesi tidak valid. Silakan login ulang.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`Password baru minimal ${MIN_LENGTH} karakter.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Password baru harus berbeda dari password lama.");
      return;
    }

    setIsSaving(true);
    try {
      // Verifikasi password lama dengan login ulang ke akun yang sama.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) {
        setError("Password lama salah.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(
          updateError.message.includes("different from the old")
            ? "Password baru harus berbeda dari password lama."
            : updateError.message,
        );
        return;
      }

      toast({ title: "Password berhasil diubah", description: "Gunakan password baru saat login berikutnya." });
      reset();
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Ubah Password
          </DialogTitle>
          <DialogDescription>Masukkan password lama, lalu buat password baru untuk akun Anda.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current_password">Password lama</Label>
            <PasswordInput
              id="current_password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">Password baru</Label>
            <PasswordInput
              id="new_password"
              autoComplete="new-password"
              placeholder={`Minimal ${MIN_LENGTH} karakter`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={MIN_LENGTH}
            />
            {tooShort && <p className="text-[11px] text-amber-700">Minimal {MIN_LENGTH} karakter.</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Ulangi password baru</Label>
            <PasswordInput
              id="confirm_password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {mismatch && <p className="text-[11px] text-amber-700">Password belum sama.</p>}
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Batal
            </Button>
            <Button type="submit" disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {isSaving ? "Menyimpan..." : "Simpan Password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
