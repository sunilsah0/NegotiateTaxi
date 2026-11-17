create type user_role as enum ('rider', 'driver', 'admin');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role user_role not null default 'rider',
  created_at timestamptz default now()
);

-- Anyone signing up can only become rider or driver, never admin
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    case when new.raw_user_meta_data->>'role' = 'driver'
         then 'driver'::user_role else 'rider'::user_role end
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create function my_role() returns user_role
language sql security definer set search_path = public stable as $$
  select role from profiles where id = auth.uid()
$$;

create table rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references profiles(id),
  driver_id uuid references profiles(id),
  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  dest_address text not null,
  dest_lat double precision,
  dest_lng double precision,
  offered_price integer not null,          -- SEK
  final_price integer,
  status text not null default 'requested'
    check (status in ('requested','accepted','arriving','in_progress','completed','cancelled')),
  created_at timestamptz default now()
);

-- Security rules (Row Level Security)
alter table profiles enable row level security;
alter table rides enable row level security;

create policy "read own profile" on profiles for select
  using (id = auth.uid() or my_role() = 'admin');

create policy "rider creates ride" on rides for insert
  with check (rider_id = auth.uid());

create policy "see relevant rides" on rides for select
  using (
    rider_id = auth.uid()
    or driver_id = auth.uid()
    or (status = 'requested' and my_role() = 'driver')
    or my_role() = 'admin'
  );

create policy "driver accepts ride" on rides for update
  using (my_role() = 'driver' and (status = 'requested' or driver_id = auth.uid()))
  with check (driver_id = auth.uid());