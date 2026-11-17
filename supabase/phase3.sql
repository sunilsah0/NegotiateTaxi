-- ===== Driver approval =====
alter table profiles add column approved boolean not null default false;
update profiles set approved = true;   -- existing test users keep working

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role user_role;
begin
  v_role := case when new.raw_user_meta_data->>'role' = 'driver'
                 then 'driver'::user_role else 'rider'::user_role end;
  insert into profiles (id, full_name, role, approved)
  values (new.id, new.raw_user_meta_data->>'full_name', v_role, v_role <> 'driver');
  return new;
end; $$;

create function is_approved_driver() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role = 'driver' and approved)
$$;

drop policy "driver sends offer" on offers;
create policy "driver sends offer" on offers for insert
  with check (driver_id = auth.uid() and is_approved_driver() and status = 'pending'
    and exists (select 1 from rides r where r.id = ride_id and r.status = 'requested'));

drop policy "driver edits own pending offer" on offers;
create policy "driver edits own pending offer" on offers for update
  using (driver_id = auth.uid() and status = 'pending')
  with check (driver_id = auth.uid() and is_approved_driver() and status = 'pending'
    and exists (select 1 from rides r where r.id = ride_id and r.status = 'requested'));

drop policy "see relevant rides" on rides;
create policy "see relevant rides" on rides for select
  using (
    rider_id = auth.uid()
    or driver_id = auth.uid()
    or (status = 'requested' and is_approved_driver())
    or my_role() = 'admin'
  );

create policy "admin updates profiles" on profiles for update
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- ===== Friends =====
create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
alter table friendships enable row level security;

create policy "see my friendships" on friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "remove my friendships" on friendships for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "see friends profiles" on profiles for select
  using (exists (select 1 from friendships f
    where (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
       or (f.addressee_id = auth.uid() and f.requester_id = profiles.id)));

-- Same quiet result whether or not the email exists (protects other people's privacy)
create function send_friend_request(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if my_role() <> 'rider' then raise exception 'Only customers can add friends'; end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_id is null or v_id = auth.uid() then return; end if;
  if not exists (select 1 from profiles where id = v_id and role = 'rider') then return; end if;
  insert into friendships (requester_id, addressee_id) values (auth.uid(), v_id)
    on conflict do nothing;
end; $$;

create function accept_friend(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update friendships set status = 'accepted'
  where id = p_id and addressee_id = auth.uid() and status = 'pending';
end; $$;

-- ===== Share a ride with a verified friend =====
create table ride_shares (
  ride_id uuid not null references rides(id) on delete cascade,
  rider_id uuid not null references profiles(id) on delete cascade,
  friend_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (ride_id, friend_id)
);
alter table ride_shares enable row level security;

create policy "see my shares" on ride_shares for select
  using (rider_id = auth.uid() or friend_id = auth.uid() or my_role() = 'admin');
create policy "rider stops sharing" on ride_shares for delete
  using (rider_id = auth.uid());

create function share_ride(p_ride uuid, p_friend uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rides where id = p_ride and rider_id = auth.uid()
                 and status in ('requested','accepted','arriving','in_progress')) then
    raise exception 'You can only share your own active ride';
  end if;
  if not exists (select 1 from friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = p_friend)
        or (addressee_id = auth.uid() and requester_id = p_friend))) then
    raise exception 'That person is not a verified friend';
  end if;
  insert into ride_shares (ride_id, rider_id, friend_id)
    values (p_ride, auth.uid(), p_friend) on conflict do nothing;
end; $$;

-- A friend can see a shared ride only while it is active, and the driver's
-- location only while it is linked to that ride (it is unlinked when the trip ends)
create policy "friend sees shared ride" on rides for select
  using (status in ('requested','accepted','arriving','in_progress')
    and exists (select 1 from ride_shares rs
                where rs.ride_id = rides.id and rs.friend_id = auth.uid()));

create policy "friend sees location" on driver_locations for select
  using (exists (select 1 from ride_shares rs
                 where rs.ride_id = driver_locations.ride_id and rs.friend_id = auth.uid()));

-- ===== SOS =====
create table sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  ride_id uuid references rides(id),
  lat double precision,
  lng double precision,
  resolved boolean not null default false,
  created_at timestamptz default now()
);
alter table sos_alerts enable row level security;
create policy "send sos" on sos_alerts for insert with check (user_id = auth.uid());
create policy "read sos" on sos_alerts for select
  using (my_role() = 'admin' or user_id = auth.uid());
create policy "admin resolves sos" on sos_alerts for update
  using (my_role() = 'admin') with check (my_role() = 'admin');

alter publication supabase_realtime add table friendships, ride_shares, sos_alerts, profiles;