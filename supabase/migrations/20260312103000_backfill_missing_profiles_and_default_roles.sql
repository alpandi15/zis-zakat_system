-- Backfill auth users into public.profiles and public.user_roles.
-- Safe to run multiple times (idempotent enough for migration/recovery).

-- 1) Create missing profile rows for existing auth users.
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

-- 2) Normalize existing profile rows that are incomplete.
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

-- 3) Ensure every auth user has at least one role (viewer by default).
INSERT INTO public.user_roles (user_id, role, created_at, updated_at)
SELECT
  u.id,
  'viewer'::public.app_role,
  NOW(),
  NOW()
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL;
