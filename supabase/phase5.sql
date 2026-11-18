-- ===== 1. Swedish-market pricing (admin can edit) =====
create table pricing_config (
  id int primary key default 1 check (id = 1),
  start_fee numeric not null default 59,
  per_km numeric not null default 14.90,
  per_hour_std numeric not null default 565,
  per_hour_peak numeric not null default 595,
  min_fare numeric not null default 79,
  floor_pct numeric not null default 85,
  ceil_pct numeric not null default 150,
  pool_radius_km numeric not null default 1.5
);
insert into pricing_config (id) values (1);
alter table pricing_config enable row level security;
create policy "everyone reads pricing" on pricing_config for select using (true);
create policy "admin edits pricing" on pricing_config for update
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- ===== 2. Helper functions =====
create function km_between(a_lat double precision, a_lng double precision,
                           b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

create function tariff_guide(p_km numeric, p_minutes numeric)
returns int language plpgsql stable as $$
declare c pricing_config; l timestamp; dow int; hr int; peak boolean; per_hour numeric;
begin
  select * into c from pricing_config where id = 1;
  l := now() at time zone 'Europe/Stockholm';
  dow := extract(isodow from l)::int;
  hr := extract(hour from l)::int;
  peak := (dow = 5 and hr >= 15) or dow in (6, 7) or (dow = 1 and hr < 6);
  per_hour := case when peak then c.per_hour_peak else c.per_hour_std end;
  return greatest(c.min_fare, round(c.start_fee + c.per_km * p_km + per_hour * p_minutes / 60.0))::int;
end; $$;

create function price_band(p_km numeric, p_minutes numeric)
returns table (guide int, min_price int, max_price int)
language plpgsql stable as $$
declare c pricing_config; g int;
begin
  select * into c from pricing_config where id = 1;
  g := tariff_guide(p_km, p_minutes);
  return query select g, round(g * c.floor_pct / 100.0)::int, round(g * c.ceil_pct / 100.0)::int;
end; $$;

-- ===== 3. New ride columns =====
alter table rides
  add column est_km numeric,
  add column est_minutes numeric,
  add column guide_price int,
  add column min_price int,
  add column max_price int,
  add column allow_pool boolean not null default false,
  add column pool_parent uuid references rides(id) on delete set null,
  add column pool_count int not null default 0;

-- ===== 4. Price guard on rides (also locks fields riders must not set) =====
create function rides_guard() returns trigger language plpgsql as $$
declare c pricing_config; hav numeric; v_km numeric; v_min numeric; g int;
begin
  select * into c from pricing_config where id = 1;
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.status := 'requested'; new.driver_id := null; new.final_price := null;
      new.pool_parent := null; new.pool_count := 0;
    end if;
    hav := km_between(new.pickup_lat, new.pickup_lng, new.dest_lat, new.dest_lng);
    v_km := greatest(coalesce(new.est_km, hav * 1.3), hav);
    v_min := greatest(coalesce(new.est_minutes, v_km * 2.2), v_km * 1.5);
    g := tariff_guide(v_km, v_min);
    new.est_km := v_km; new.est_minutes := v_min; new.guide_price := g;
    new.min_price := round(g * c.floor_pct / 100.0);
    new.max_price := round(g * c.ceil_pct / 100.0);
    if new.offered_price < new.min_price or new.offered_price > new.max_price then
      raise exception 'Your offer must be between % and % kr for this trip.', new.min_price, new.max_price;
    end if;
  else
    if current_user = 'authenticated' then
      new.est_km := old.est_km; new.est_minutes := old.est_minutes;
      new.guide_price := old.guide_price; new.min_price := old.min_price; new.max_price := old.max_price;
      new.pool_parent := old.pool_parent; new.pool_count := old.pool_count;
    end if;
    if new.offered_price is distinct from old.offered_price
       and (new.offered_price < new.min_price or new.offered_price > new.max_price) then
      raise exception 'Your offer must be between % and % kr for this trip.', new.min_price, new.max_price;
    end if;
  end if;
  return new;
end; $$;
create trigger rides_guard_trg before insert or update on rides
  for each row execute function rides_guard();

-- ===== 5. Price guard on driver offers =====
create function offers_guard() returns trigger language plpgsql as $$
declare r rides;
begin
  select * into r from rides where id = new.ride_id;
  if r.min_price is not null and (new.price < r.min_price or new.price > r.max_price) then
    raise exception 'Price must be between % and % kr for this trip.', r.min_price, r.max_price;
  end if;
  return new;
end; $$;
create trigger offers_guard_trg before insert or update of price on offers
  for each row execute function offers_guard();

-- ===== 6. Shared-ride rules =====
create function driver_busy(p_driver uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from rides
                 where driver_id = p_driver and status in ('accepted','arriving','in_progress'))
$$;

create function pool_match(p_primary uuid, p_candidate uuid) returns boolean
language plpgsql security definer set search_path = public stable as $$
declare a rides; b rides; c pricing_config;
begin
  select * into a from rides where id = p_primary;
  select * into b from rides where id = p_candidate;
  select * into c from pricing_config where id = 1;
  if a.id is null or b.id is null then return false; end if;
  if not a.allow_pool or not b.allow_pool then return false; end if;          -- BOTH riders must allow it
  if a.pool_parent is not null or b.pool_parent is not null then return false; end if;
  if a.status not in ('accepted','arriving','in_progress') or b.status <> 'requested' then return false; end if;
  if a.rider_id = b.rider_id then return false; end if;
  if exists (select 1 from rides where pool_parent = p_primary
             and status in ('accepted','arriving','in_progress')) then return false; end if;   -- max one extra
  return km_between(a.pickup_lat, a.pickup_lng, b.pickup_lat, b.pickup_lng) <= c.pool_radius_km
     and km_between(a.dest_lat, a.dest_lng, b.dest_lat, b.dest_lng) <= c.pool_radius_km;
end; $$;

create function driver_can_offer(p_ride uuid) returns boolean
language plpgsql security definer set search_path = public stable as $$
declare v_primary uuid;
begin
  if not driver_busy(auth.uid()) then return true; end if;
  select id into v_primary from rides
   where driver_id = auth.uid() and status in ('accepted','arriving','in_progress') and pool_parent is null
   order by created_at limit 1;
  return v_primary is not null and pool_match(v_primary, p_ride);
end; $$;

create function pool_candidates(p_primary uuid) returns setof rides
language sql security definer set search_path = public stable as $$
  select r.* from rides r
  where is_approved_driver()
    and exists (select 1 from rides a where a.id = p_primary and a.driver_id = auth.uid())
    and r.status = 'requested'
    and pool_match(p_primary, r.id)
  order by r.created_at desc
$$;

-- First name of the other passenger, visible only to riders in the same shared trip
create function pool_mate(p_ride uuid) returns table (full_name text, status text)
language sql security definer set search_path = public stable as $$
  select split_part(coalesce(p.full_name, 'Passenger'), ' ', 1), r2.status
  from rides me
  join rides r2 on (r2.pool_parent = me.id or r2.id = me.pool_parent)
  join profiles p on p.id = r2.rider_id
  where me.id = p_ride and me.rider_id = auth.uid()
    and r2.status in ('accepted','arriving','in_progress')
$$;

-- ===== 7. Offer rules: a busy driver can only bid on a valid shared ride =====
drop policy "driver sends offer" on offers;
create policy "driver sends offer" on offers for insert
  with check (driver_id = auth.uid() and is_approved_driver() and status = 'pending'
    and driver_can_offer(ride_id)
    and exists (select 1 from rides r where r.id = ride_id and r.status = 'requested'));

drop policy "driver edits own pending offer" on offers;
create policy "driver edits own pending offer" on offers for update
  using (driver_id = auth.uid() and status = 'pending')
  with check (driver_id = auth.uid() and is_approved_driver() and status = 'pending'
    and driver_can_offer(ride_id)
    and exists (select 1 from rides r where r.id = ride_id and r.status = 'requested'));

-- ===== 8. Accepting an offer and changing status =====
create or replace function accept_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_offer offers; v_ride rides; v_primary rides;
begin
  select * into v_offer from offers where id = p_offer;
  if not found then raise exception 'Offer not found'; end if;
  select * into v_ride from rides where id = v_offer.ride_id for update;
  if v_ride.rider_id is distinct from auth.uid() then raise exception 'Not your ride'; end if;
  if v_ride.status <> 'requested' then raise exception 'Ride is no longer open'; end if;
  if v_offer.price < v_ride.min_price or v_offer.price > v_ride.max_price then
    raise exception 'Offer is outside the allowed price range';
  end if;

  if driver_busy(v_offer.driver_id) then
    select * into v_primary from rides
     where driver_id = v_offer.driver_id and status in ('accepted','arriving','in_progress') and pool_parent is null
     order by created_at limit 1;
    if v_primary.id is null or not pool_match(v_primary.id, v_ride.id) then
      raise exception 'This driver is busy on another trip';
    end if;
    update rides set pool_count = pool_count + 1 where id = v_primary.id;
    update rides set driver_id = v_offer.driver_id, final_price = v_offer.price,
           status = 'accepted', pool_parent = v_primary.id where id = v_ride.id;
  else
    update rides set driver_id = v_offer.driver_id, final_price = v_offer.price,
           status = 'accepted' where id = v_ride.id;
  end if;
  update offers set status = case when id = p_offer then 'accepted' else 'rejected' end
         where ride_id = v_ride.id;
end; $$;

create or replace function set_ride_status(p_ride uuid, p_status text) returns void
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
    -- keep the driver's location linked to another active trip (shared ride) if there is one
    update driver_locations
       set ride_id = (select id from rides
                      where driver_id = v.driver_id and status in ('accepted','arriving','in_progress')
                        and id <> p_ride order by created_at limit 1)
     where driver_id = v.driver_id and ride_id = p_ride;
  end if;
end; $$;

-- ===== 9. Location visibility for shared passengers =====
drop policy "rider and admin see location" on driver_locations;
create policy "rider and admin see location" on driver_locations for select
  using (my_role() = 'admin'
    or exists (select 1 from rides r where r.rider_id = auth.uid()
      and (r.id = driver_locations.ride_id
           or (r.pool_parent = driver_locations.ride_id
               and r.status in ('accepted','arriving','in_progress')))));

drop policy "friend sees location" on driver_locations;
create policy "friend sees location" on driver_locations for select
  using (exists (select 1 from ride_shares rs join rides r on r.id = rs.ride_id
    where rs.friend_id = auth.uid()
      and r.status in ('requested','accepted','arriving','in_progress')
      and (r.id = driver_locations.ride_id or r.pool_parent = driver_locations.ride_id)));