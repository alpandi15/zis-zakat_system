-- Allow admin user management flow to create missing profile rows
-- and backfill any existing auth users that still do not have profiles.

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(BTRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), ''),
    NULLIF(BTRIM(COALESCE(u.raw_user_meta_data ->> 'name', '')), ''),
    SPLIT_PART(COALESCE(u.email, ''), '@', 1),
    'Pengguna'
  ) AS full_name,
  COALESCE(u.created_at, NOW()),
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

UPDATE public.profiles p
SET
  email = COALESCE(p.email, u.email),
  full_name = COALESCE(
    NULLIF(BTRIM(p.full_name), ''),
    NULLIF(BTRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), ''),
    NULLIF(BTRIM(COALESCE(u.raw_user_meta_data ->> 'name', '')), ''),
    SPLIT_PART(COALESCE(u.email, ''), '@', 1),
    'Pengguna'
  ),
  updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND (
    p.email IS NULL
    OR p.full_name IS NULL
    OR BTRIM(p.full_name) = ''
  );
