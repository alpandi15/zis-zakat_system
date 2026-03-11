-- Step 1: Add asnaf_id column to mustahik table (nullable initially for migration)
ALTER TABLE public.mustahik 
ADD COLUMN asnaf_id uuid REFERENCES public.asnaf_settings(id);

-- Step 2: Migrate existing ENUM values to asnaf_id by matching asnaf_code
UPDATE public.mustahik m
SET asnaf_id = (
  SELECT id FROM public.asnaf_settings a 
  WHERE a.asnaf_code = m.asnaf::text
  LIMIT 1
);

-- Step 3: Make asnaf_id NOT NULL after migration
ALTER TABLE public.mustahik 
ALTER COLUMN asnaf_id SET NOT NULL;

-- Step 4: Create index for better query performance
CREATE INDEX idx_mustahik_asnaf_id ON public.mustahik(asnaf_id);

-- Step 5: Add Anak Yatim if it doesn't exist
INSERT INTO public.asnaf_settings (
  asnaf_code, asnaf_name, receives_zakat_fitrah, receives_zakat_mal, 
  receives_fidyah, distribution_percentage, is_system_default, is_active, sort_order
)
SELECT 'anak_yatim', 'Anak Yatim', true, true, true, 0, false, true, 9
WHERE NOT EXISTS (
  SELECT 1 FROM public.asnaf_settings WHERE asnaf_code = 'anak_yatim'
);