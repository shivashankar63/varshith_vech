-- Add missing columns to user_profiles to support both users and drivers
-- Run this AFTER running the main schema.sql

alter table public.user_profiles add column if not exists driver_id text;
alter table public.user_profiles add column if not exists user_id text;
alter table public.user_profiles add column if not exists bus_id text;

-- Add index for lookups
create index if not exists idx_user_profiles_driver_id on public.user_profiles(driver_id);
create index if not exists idx_user_profiles_user_id on public.user_profiles(user_id);
