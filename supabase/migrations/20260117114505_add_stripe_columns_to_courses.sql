alter table if exists public.courses
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table if exists public.courses
  add column if not exists price_cents integer not null default 0,
  add column if not exists currency text not null default 'gbp';

