-- Create asnaf_settings table for managing Asnaf eligibility and distribution percentages
CREATE TABLE public.asnaf_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asnaf_code TEXT NOT NULL UNIQUE,
  asnaf_name TEXT NOT NULL,
  receives_zakat_fitrah BOOLEAN NOT NULL DEFAULT true,
  receives_zakat_mal BOOLEAN NOT NULL DEFAULT true,
  receives_fidyah BOOLEAN NOT NULL DEFAULT false,
  distribution_percentage NUMERIC NOT NULL DEFAULT 10.00,
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asnaf_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view asnaf settings" 
  ON public.asnaf_settings 
  FOR SELECT 
  USING (true);

CREATE POLICY "Admins can update asnaf settings" 
  ON public.asnaf_settings 
  FOR UPDATE 
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert non-system asnaf settings" 
  ON public.asnaf_settings 
  FOR INSERT 
  WITH CHECK (is_admin(auth.uid()) AND is_system_default = false);

CREATE POLICY "Admins can delete non-system asnaf settings" 
  ON public.asnaf_settings 
  FOR DELETE 
  USING (is_admin(auth.uid()) AND is_system_default = false);

-- Insert default 8 Asnaf (system defaults - cannot be deleted)
INSERT INTO public.asnaf_settings (asnaf_code, asnaf_name, receives_zakat_fitrah, receives_zakat_mal, receives_fidyah, distribution_percentage, is_system_default, sort_order) VALUES
  ('fakir', 'Fakir', true, true, true, 12.50, true, 1),
  ('miskin', 'Miskin', true, true, true, 12.50, true, 2),
  ('amil', 'Amil', true, true, false, 12.50, true, 3),
  ('muallaf', 'Muallaf', true, true, false, 12.50, true, 4),
  ('riqab', 'Riqab', true, true, false, 12.50, true, 5),
  ('gharimin', 'Gharimin', true, true, false, 12.50, true, 6),
  ('fisabilillah', 'Fisabilillah', true, true, false, 12.50, true, 7),
  ('ibnu_sabil', 'Ibnu Sabil', true, true, false, 12.50, true, 8);

-- Insert Anak Yatim as an editable (non-system) Asnaf that receives Fidyah
INSERT INTO public.asnaf_settings (asnaf_code, asnaf_name, receives_zakat_fitrah, receives_zakat_mal, receives_fidyah, distribution_percentage, is_system_default, sort_order) VALUES
  ('anak_yatim', 'Anak Yatim', true, true, true, 0.00, false, 9);

-- Add updated_at trigger
CREATE TRIGGER update_asnaf_settings_updated_at
  BEFORE UPDATE ON public.asnaf_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();