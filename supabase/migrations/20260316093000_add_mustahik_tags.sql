ALTER TABLE public.mustahik
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_mustahik_tags
  ON public.mustahik
  USING gin (tags);
