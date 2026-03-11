-- Step 1: Add deleted_at column for soft delete on mustahik
ALTER TABLE public.mustahik 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Step 2: Create index for faster filtering of active records
CREATE INDEX idx_mustahik_deleted_at ON public.mustahik(deleted_at) WHERE deleted_at IS NULL;

-- Step 3: Add RLS policy allowing admins to perform soft delete (update deleted_at)
-- The existing update policy already allows this, but we add a note about soft delete

-- Step 4: Reset all non-Amil asnaf percentages to 0 (Amil keeps its percentage)
UPDATE public.asnaf_settings 
SET distribution_percentage = 0 
WHERE asnaf_code != 'amil';

-- Step 5: Ensure Amil has a default percentage if not set
UPDATE public.asnaf_settings 
SET distribution_percentage = 12.5 
WHERE asnaf_code = 'amil' AND distribution_percentage = 0;