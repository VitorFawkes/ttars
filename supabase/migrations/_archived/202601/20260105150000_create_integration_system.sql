-- Create integrations table
create table public.integrations (
    id uuid not null default gen_random_uuid(),
    name text not null,
    type text not null check (type in ('input', 'output')),
    provider text not null default 'webhook', -- 'webhook', 'stripe', 'typeform', etc.
    config jsonb not null default '{}'::jsonb, -- headers, secret_key, retry_policy, mapping
    transformer_rules jsonb not null default '[]'::jsonb, -- Array of transformation rules
    is_active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint integrations_pkey primary key (id)
);

-- Create integration_events table (The Queue/Log)
create table public.integration_events (
    id uuid not null default gen_random_uuid(),
    integration_id uuid not null references public.integrations(id) on delete cascade,
    idempotency_key text, -- Optional, but recommended for Inputs
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'retrying')),
    attempts integer not null default 0,
    next_retry_at timestamp with time zone,
    payload jsonb, -- The raw input or output payload
    response jsonb, -- The response from the external system or internal processing
    logs jsonb default '[]'::jsonb, -- Array of execution steps/logs
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint integration_events_pkey primary key (id)
);

-- Indexes for performance
create index idx_integrations_type on public.integrations(type);
create index idx_integration_events_integration_id on public.integration_events(integration_id);
create index idx_integration_events_status on public.integration_events(status);
create index idx_integration_events_next_retry_at on public.integration_events(next_retry_at) where status in ('pending', 'retrying');
create unique index idx_integration_events_idempotency on public.integration_events(integration_id, idempotency_key) where idempotency_key is not null;

-- RLS Policies
alter table public.integrations enable row level security;
alter table public.integration_events enable row level security;

-- Admins can do everything
create policy "Admins can manage integrations"
    on public.integrations
    for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
    );

create policy "Admins can view integration events"
    on public.integration_events
    for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
    );

-- Service Role (Edge Functions) needs full access
-- (Implicitly has access, but good to be explicit if we ever lock it down further, 
-- though RLS doesn't apply to service_role by default usually, but we keep it clean)

-- Trigger to update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger set_timestamp_integrations
    before update on public.integrations
    for each row
    execute procedure public.handle_updated_at();

create trigger set_timestamp_integration_events
    before update on public.integration_events
    for each row
    execute procedure public.handle_updated_at();
