-- Repair bootstrap admin auth rows to avoid GoTrue login error:
-- {"code":"unexpected_failure","message":"Database error querying schema"}
-- Safe to run multiple times.

DO $$
DECLARE
  bootstrap_email TEXT := 'admin@zakatku.local';
  bootstrap_password TEXT := 'Admin123!';
  bootstrap_full_name TEXT := 'Super Admin';
  bootstrap_user_id UUID;
  auth_instance_id UUID;
BEGIN
  SELECT id
  INTO auth_instance_id
  FROM auth.instances
  ORDER BY created_at
  LIMIT 1;

  auth_instance_id := COALESCE(auth_instance_id, '00000000-0000-0000-0000-000000000000'::UUID);

  SELECT id
  INTO bootstrap_user_id
  FROM auth.users
  WHERE email = bootstrap_email
  LIMIT 1;

  IF bootstrap_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(bootstrap_password, extensions.gen_salt('bf')),
    instance_id = COALESCE(instance_id, auth_instance_id),
    aud = 'authenticated',
    role = 'authenticated',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmation_sent_at = COALESCE(confirmation_sent_at, now()),
    recovery_sent_at = COALESCE(recovery_sent_at, now()),
    last_sign_in_at = COALESCE(last_sign_in_at, now()),
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    email_change = COALESCE(email_change, ''),
    phone_change = COALESCE(phone_change, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
    raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', bootstrap_full_name),
    updated_at = now()
  WHERE id = bootstrap_user_id;

  UPDATE auth.identities
  SET
    provider_id = bootstrap_user_id::TEXT,
    identity_data = jsonb_build_object(
      'sub', bootstrap_user_id::TEXT,
      'email', bootstrap_email,
      'email_verified', true,
      'phone_verified', false
    ),
    last_sign_in_at = COALESCE(last_sign_in_at, now()),
    updated_at = now()
  WHERE user_id = bootstrap_user_id
    AND provider = 'email';

  IF NOT EXISTS (
    SELECT 1
    FROM auth.identities ai
    WHERE ai.user_id = bootstrap_user_id
      AND ai.provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      bootstrap_user_id,
      bootstrap_user_id::TEXT,
      bootstrap_user_id,
      jsonb_build_object(
        'sub', bootstrap_user_id::TEXT,
        'email', bootstrap_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (bootstrap_user_id, bootstrap_email, bootstrap_full_name)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (bootstrap_user_id, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END
$$;
