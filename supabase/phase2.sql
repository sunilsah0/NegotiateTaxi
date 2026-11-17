-- Drivers can no longer grab rides directly; they must win a negotiation
drop policy if exists "driver accepts ride" on rides;

-- Rider may change the offered price on their own open request
create policy "rider edits open request" on rides for update
  using (rider_id = auth.uid() and status = 'requested')
  with check (rider_id = auth.uid() and status = 'requested'
              and driver_id is null and final_price is null);

-- Offers from drivers
create table offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  driver_id uuid not null references profiles(id),
  price integer not null check (price > 0 and price <= 5000),
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now(),
  unique (ride_id, driver_id)
);
alter table offers enable row level security;

create policy "driver sends offer" on offers for insert
  with check (driver_id = auth.uid() and my_role() = 'driver' and status = 'pending'
    and exists (select 1 from rides r where r.id = ride_id and r.status = 'requested'));

create policy "driver edits own pending offer" on offers for update
  using (driver_id = auth.uid() and status = 'pending')
  with check (driver_id = auth.uid() and status = 'pending'
    and exists (select 1 from rides r where r.id = ride_id and r.status = 'requested'));

create policy "see relevant offers" on offers for select
  using (driver_id = auth.uid() or my_role() = 'admin'
    or exists (select 1 from rides r where r.id = ride_id and r.rider_id = auth.uid()));

-- Rider can read the name of drivers who offered / were chosen
create policy "rider sees offering drivers" on profiles for select
  using (
    exists (select 1 from offers o join rides r on r.id = o.ride_id
            where o.driver_id = profiles.id and r.rider_id = auth.uid())
    or exists (select 1 from rides r
            where r.driver_id = profiles.id and r.rider_id = auth.uid())
  );

-- Live driver location (one row per driver, updated every few seconds)
create table driver_locations (
  driver_id uuid primary key references profiles(id) on delete cascade,
  ride_id uuid references rides(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table driver_locations enable row level security;

create policy "driver writes own location" on driver_locations for all
  using (driver_id = auth.uid() and my_role() = 'driver')
  with check (driver_id = auth.uid() and my_role() = 'driver');

create policy "rider and admin see location" on driver_locations for select
  using (my_role() = 'admin'
    or exists (select 1 from rides r
               where r.id = driver_locations.ride_id and r.rider_id = auth.uid()));

-- Rider accepts an offer: price gets locked, all in one safe step
create function accept_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_offer offers; v_ride rides;
begin
  select * into v_offer from offers where id = p_offer;
  if not found then raise exception 'Offer not found'; end if;
  select * into v_ride from rides where id = v_offer.ride_id for update;
  if v_ride.rider_id is distinct from auth.uid() then raise exception 'Not your ride'; end if;
  if v_ride.status <> 'requested' then raise exception 'Ride is no longer open'; end if;
  update rides set driver_id = v_offer.driver_id, final_price = v_offer.price,
         status = 'accepted' where id = v_ride.id;
  update offers set status = case when id = p_offer then 'accepted' else 'rejected' end
         where ride_id = v_ride.id;
end; $$;

-- Status changes: only valid steps, only by the right person
create function set_ride_status(p_ride uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v rides;
begin
  select * into v from rides where id = p_ride for update;
  if not found then raise exception 'Ride not found'; end if;
  if v.driver_id = auth.uid() then
    if not ((v.status = 'accepted' and p_status = 'arriving')
         or (v.status = 'arriving' and p_status = 'in_progress')
         or (v.status = 'in_progress' and p_status = 'completed')) then
      raise exception 'Invalid status change';
    end if;
  elsif v.rider_id = auth.uid() then
    if not (p_status = 'cancelled' and v.status in ('requested','accepted','arriving')) then
      raise exception 'Invalid status change';
    end if;
  else
    raise exception 'Not allowed';
  end if;
  update rides set status = p_status where id = p_ride;
  if p_status in ('completed','cancelled') and v.driver_id is not null then
    -- stop sharing the driver's location once the trip is over
    update driver_locations set ride_id = null
      where driver_id = v.driver_id and ride_id = p_ride;
  end if;
end; $$;

-- Turn on realtime updates
alter publication supabase_realtime add table rides, offers, driver_locations;