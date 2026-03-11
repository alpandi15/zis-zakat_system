import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface AsnafSetting {
  id: string;
  asnaf_code: string;
  asnaf_name: string;
  receives_zakat_fitrah: boolean;
  receives_zakat_mal: boolean;
  receives_fidyah: boolean;
  distribution_percentage: number;
  is_system_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useAsnafSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: asnafSettings = [], isLoading } = useQuery({
    queryKey: ["asnaf-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asnaf_settings")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      return data as AsnafSetting[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (setting: Partial<AsnafSetting> & { id: string }) => {
      const { id, ...updates } = setting;
      const { error } = await supabase
        .from("asnaf_settings")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asnaf-settings"] });
      toast({ title: "Pengaturan Asnaf berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (setting: Omit<AsnafSetting, "id" | "created_at" | "updated_at" | "is_system_default">) => {
      const { error } = await supabase
        .from("asnaf_settings")
        .insert({ ...setting, is_system_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asnaf-settings"] });
      toast({ title: "Asnaf baru berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("asnaf_settings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asnaf-settings"] });
      toast({ title: "Asnaf berhasil dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  // Get eligibility for a specific asnaf code
  const getEligibility = (asnafCode: string) => {
    const setting = asnafSettings.find(s => s.asnaf_code === asnafCode);
    return {
      zakatFitrah: setting?.receives_zakat_fitrah ?? true,
      zakatMal: setting?.receives_zakat_mal ?? true,
      fidyah: setting?.receives_fidyah ?? false,
    };
  };

  // Get asnaf label by code
  const getLabel = (asnafCode: string) => {
    const setting = asnafSettings.find(s => s.asnaf_code === asnafCode);
    return setting?.asnaf_name || asnafCode;
  };

  // Get all active asnaf for dropdown selection (with id for FK reference)
  const getAsnafOptions = () => {
    return asnafSettings.map(s => ({
      id: s.id,
      value: s.asnaf_code,
      label: s.asnaf_name,
    }));
  };

  // Get asnaf by ID
  const getAsnafById = (id: string) => {
    return asnafSettings.find(s => s.id === id);
  };

  // Get eligibility by asnaf ID
  const getEligibilityById = (asnafId: string) => {
    const setting = asnafSettings.find(s => s.id === asnafId);
    return {
      zakatFitrah: setting?.receives_zakat_fitrah ?? true,
      zakatMal: setting?.receives_zakat_mal ?? true,
      fidyah: setting?.receives_fidyah ?? false,
    };
  };

  // Calculate total percentage
  const totalPercentage = asnafSettings.reduce(
    (sum, s) => sum + (s.distribution_percentage || 0),
    0
  );

  // Validate percentage total equals 100
  const isPercentageValid = Math.abs(totalPercentage - 100) < 0.01;

  return {
    asnafSettings,
    isLoading,
    updateMutation,
    createMutation,
    deleteMutation,
    getEligibility,
    getEligibilityById,
    getLabel,
    getAsnafById,
    getAsnafOptions,
    totalPercentage,
    isPercentageValid,
  };
}
