-- Create fake users in auth.users first, then profiles
-- Note: This requires permissions to write to auth.users.

DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- User 1: SDR Ana
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sdr1@fake.com') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'sdr1@fake.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    RETURNING id INTO new_user_id;

    INSERT INTO public.profiles (id, email, nome, role, active)
    VALUES (new_user_id, 'sdr1@fake.com', 'SDR Ana (Fake)', 'sdr', true);
  END IF;

  -- User 2: SDR Bruno
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sdr2@fake.com') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'sdr2@fake.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    RETURNING id INTO new_user_id;

    INSERT INTO public.profiles (id, email, nome, role, active)
    VALUES (new_user_id, 'sdr2@fake.com', 'SDR Bruno (Fake)', 'sdr', true);
  END IF;

  -- User 3: Planner Carlos
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'planner1@fake.com') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'planner1@fake.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    RETURNING id INTO new_user_id;

    INSERT INTO public.profiles (id, email, nome, role, active)
    VALUES (new_user_id, 'planner1@fake.com', 'Planner Carlos (Fake)', 'vendas', true);
  END IF;

END $$;
