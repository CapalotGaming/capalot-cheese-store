-- Extra backend table for storing Square webhook payloads.
create table if not exists square_webhook_events (
  id uuid primary key default gen_random_uuid(),
  square_event_id text,
  event_type text,
  signature_valid boolean default false,
  payload jsonb not null,
  received_at timestamp with time zone default now()
);

alter table square_webhook_events enable row level security;

-- No public policies needed. Backend uses service role key.

-- Helpful indexes
create index if not exists idx_orders_square_order_id on orders(square_order_id);
create index if not exists idx_orders_user_id_created_at on orders(user_id, created_at desc);
create index if not exists idx_profiles_email on profiles(email);
