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
  category       text,          -- "Category", e.g. "HVAC services" — drives AI email tailoring
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

-- If the table already existed before the folders / AI-compose features, add
-- the columns too (idempotent — safe to run on a fresh or existing database).
alter table public.leads add column if not exists batch text;
alter table public.leads add column if not exists category text;

-- Lookups you'll likely add next (search by business / dedupe by site / folder).
create index if not exists leads_name_idx    on public.leads (name);
create index if not exists leads_website_idx on public.leads (website);
create index if not exists leads_batch_idx   on public.leads (batch);

-- ── app_settings ─────────────────────────────────────────────────────────────
-- Small key/value store for runtime configuration set from the dashboard (e.g.
-- the n8n webhook URLs on the Integrations tab), so an operator can point the
-- app at their automation without editing environment variables and redeploying.
-- Written server-side with the SERVICE ROLE key (app/api/integrations); a saved
-- value overrides the matching env var, and env is the fallback when unset.
create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Note: the Sector Playbooks per-category mapping (KB markdown + PDF metadata)
-- is stored in app_settings under key "sector_playbooks". The KB markdown is
-- inline; the attachment PDF bytes live in the sector-assets Storage bucket
-- below.

-- ── sector-assets storage bucket ─────────────────────────────────────────────
-- Public bucket holding the compressed sector portfolio PDFs the Send Campaigns
-- flow attaches to outreach emails (managed from the Sector Playbooks tab).
-- Public-read so the n8n send workflow can fetch each PDF by URL and attach it;
-- writes are server-side only (service role, app/api/sector-playbooks/pdf).
insert into storage.buckets (id, name, public)
values ('sector-assets', 'sector-assets', true)
on conflict (id) do update set public = true;

-- Public read of objects in the bucket (so the attachment URL resolves for n8n).
drop policy if exists "sector-assets public read" on storage.objects;
create policy "sector-assets public read"
  on storage.objects for select
  to public
  using (bucket_id = 'sector-assets');

-- OPTIONAL — turn on Row Level Security once you build the table view. With RLS
-- enabled the server importer (service role) still writes fine; the browser
-- (anon key) then needs an explicit read policy:
--
--   alter table public.leads enable row level security;
--   create policy "read leads" on public.leads for select to anon using (true);
