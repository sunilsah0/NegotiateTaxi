export type Pos = { lat: number; lng: number };

export type Ride = {
  id: string;
  rider_id: string;
  driver_id: string | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dest_address: string;
  dest_lat: number;
  dest_lng: number;
  offered_price: number;
  final_price: number | null;
  status: 'requested' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  est_km: number | null;
  est_minutes: number | null;
  guide_price: number | null;
  min_price: number | null;
  max_price: number | null;
  allow_pool: boolean;
  pool_parent: string | null;
  pool_count: number;
};

export type Offer = {
  id: string;
  ride_id: string;
  driver_id: string;
  price: number;
  status: string;
  profiles?: { full_name: string | null } | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  role: 'rider' | 'driver' | 'admin';
  approved: boolean;
};