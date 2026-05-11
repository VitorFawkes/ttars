-- Create fake users for testing
-- Insert into auth.users is not possible directly via SQL editor usually due to permissions, 
-- but we can insert into public.profiles if the trigger doesn't block it or if we just want to test the UI selector.
-- However, UserSelector fetches from 'profiles'.
-- To properly test, we ideally need auth users, but for UI testing, profiles might be enough if the foreign key isn't strict or if we just want them to appear in the list.
-- Let's try inserting into profiles directly. If it fails due to FK constraint on id (references auth.users), we might need another way or just use existing users.
-- Assuming we can't easily create auth users via SQL here without admin functions.
-- Let's check if we can just insert into profiles.

INSERT INTO public.profiles (id, email, nome, role, active)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'sdr1@fake.com', 'SDR Ana (Fake)', 'sdr', true),
    ('00000000-0000-0000-0000-000000000002', 'sdr2@fake.com', 'SDR Bruno (Fake)', 'sdr', true),
    ('00000000-0000-0000-0000-000000000003', 'planner1@fake.com', 'Planner Carlos (Fake)', 'planner', true),
    ('00000000-0000-0000-0000-000000000004', 'planner2@fake.com', 'Planner Daniela (Fake)', 'planner', true)
ON CONFLICT (id) DO NOTHING;
