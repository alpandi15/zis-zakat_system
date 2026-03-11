import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";

interface ReadOnlyBannerProps {
  periodName?: string;
}

export function ReadOnlyBanner({ periodName }: ReadOnlyBannerProps) {
  return (
    <Alert className="mb-6 border-warning/50 bg-warning/10">
      <Lock className="h-4 w-4 text-warning" />
      <AlertDescription className="text-warning-foreground">
        Periode <strong>{periodName}</strong> sudah diarsipkan. Data hanya dapat dilihat, tidak dapat diubah.
      </AlertDescription>
    </Alert>
  );
}
