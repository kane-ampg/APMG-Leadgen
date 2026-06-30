-- APMG Lead Gen — `leads` table for the Pipeline CSV importer.
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → New query → paste this → Run.
--
-- The Pipeline tool (app/api/pipeline/upload) writes here via the Supabase REST
-- API using the SERVICE ROLE key, server-side only. The service role bypasses
-- RLS, so no insert policy is required for the importer to work.

create extension if not exists pgcrypto;  -- gen_random_uuid()

create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  address        text,
  featured_image text,          -- "Featured image"
  bing_maps_url  text,          -- "Bing Maps URL"
  rating         numeric,       -- 1.0 – 5.0, null when the listing had no rating
  website        text,
  phone          text,
  emails         text[] not null default '{}',   -- "Emails" split on comma
  social_medias  text[] not null default '{}',   -- "Social Medias" split on comma
  facebook       text,
  instagram      text,
  twitter        text,          -- CSV header "Twitter" (a.k.a. Twitter/X)
  batch          text,          -- import "folder", e.g. leads-0001-20260629-073700
  created_at     timestamptz not null default now()
);

-- If the table already existed before the folders feature, add the column too
-- (idempotent — safe to run on a fresh or existing database).
alter table public.leads add column if not exists batch text;

-- Lookups you'll likely add next (search by business / dedupe by site / folder).
create index if not exists leads_name_idx    on public.leads (name);
create index if not exists leads_website_idx on public.leads (website);
create index if not exists leads_batch_idx   on public.leads (batch);

-- OPTIONAL — turn on Row Level Security once you build the table view. With RLS
-- enabled the server importer (service role) still writes fine; the browser
-- (anon key) then needs an explicit read policy:
--
--   alter table public.leads enable row level security;
--   create policy "read leads" on public.leads for select to anon using (true);
