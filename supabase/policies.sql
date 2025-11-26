-- Supabase Row-Level Security policies for Smart Bus Tracking
-- Enable RLS on relevant tables
-- Note: Adjust schema/table names to match your project.

-- Example tables: profiles, buses, drivers, positions, alerts, assignments

-- Profiles table: users and drivers
-- Disable RLS temporarily or use service role for profile operations
alter table profiles enable row level security;

-- Allow authenticated users to read any profile (for display purposes)
create policy "authenticated users read profiles" on profiles for select
  to authenticated
  using (true);

-- Only the trigger can insert (using SECURITY DEFINER)
-- Users cannot directly insert
create policy "service role insert profiles" on profiles for insert
  to service_role
  with check (true);

-- Users can update their own profile
create policy "users update own profile" on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Buses table: general read, restrict updates to admins
alter table buses enable row level security;
create policy "read buses" on buses for select using (true);
create policy "admins manage buses" on buses for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Drivers table: drivers see self, admins see all
alter table drivers enable row level security;
create policy "drivers read self" on drivers for select using (
  auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Assignments: who is assigned to which bus/route
alter table assignments enable row level security;
create policy "read own assignment" on assignments for select using (
  driver_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "admin manage assignments" on assignments for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Positions: LIVE updates from drivers
-- Drivers can only insert/update positions for their assigned bus.
alter table positions enable row level security;
create policy "read positions" on positions for select using (true);
create policy "driver upserts own bus" on positions for insert using (
  exists (
    select 1 from assignments a
    where a.driver_id = auth.uid()
      and a.bus_id = positions.bus_id
  )
) with check (
  exists (
    select 1 from assignments a
    where a.driver_id = auth.uid()
      and a.bus_id = positions.bus_id
  )
);
create policy "driver updates own bus" on positions for update using (
  exists (
    select 1 from assignments a
    where a.driver_id = auth.uid()
      and a.bus_id = positions.bus_id
  )
) with check (
  exists (
    select 1 from assignments a
    where a.driver_id = auth.uid()
      and a.bus_id = positions.bus_id
  )
);

-- Alerts: Anyone can create alerts for a bus; admins resolve
alter table alerts enable row level security;
create policy "read alerts" on alerts for select using (true);
create policy "create alerts" on alerts for insert using (true) with check (true);
create policy "admin resolve" on alerts for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Auto-create profile from user metadata on signup
-- This trigger creates a profile row automatically when a user signs up
-- SECURITY DEFINER allows it to bypass RLS policies
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to call the function on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rate limiting on inserts can be supplemented via Postgres triggers/functions.
-- Example: limit positions to 60/min per bus using a trigger.
-- (Pseudo-implementation, adapt to your schema)
-- create extension if not exists pg_stat_statements;
-- create function enforce_rate_limit() returns trigger as $$
-- begin
--   -- Count rows in last minute for this bus
--   if (select count(*) from positions where bus_id = new.bus_id and created_at > now() - interval '1 minute') >= 60 then
--     raise exception 'Rate limit exceeded for bus %', new.bus_id;
--   end if;
--   return new;
-- end;
-- $$ language plpgsql;
-- create trigger positions_rate_limit before insert on positions
-- for each row execute procedure enforce_rate_limit();
