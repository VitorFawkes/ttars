-- Migration: Create Activities System
-- Run this in Supabase SQL Editor

-- Create activities table
create table if not exists public.activities (
    id uuid primary key default gen_random_uuid(),
    card_id uuid references public.cards(id) on delete cascade not null,
    tipo text not null,
    descricao text not null,
    metadata jsonb,
    created_by uuid references public.profiles(id),
    created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_activities_card_id on public.activities(card_id);
create index if not exists idx_activities_created_at on public.activities(created_at desc);

-- RLS Policies
alter table public.activities enable row level security;

create policy "Users can view activities for cards they can see"
on public.activities for select
using (
    exists (
        select 1 from cards
        where cards.id = activities.card_id
    )
);

create policy "Users can create activities"
on public.activities for insert
with check (auth.uid() = created_by);

-- Function to log task activities
create or replace function log_task_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'task_created',
            'Tarefa criada: ' || NEW.titulo,
            jsonb_build_object('task_id', NEW.id, 'due_date', NEW.data_vencimento),
            NEW.created_by
        );
    elsif TG_OP = 'UPDATE' and OLD.concluida = false and NEW.concluida = true then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'task_completed',
            'Tarefa concluída: ' || NEW.titulo,
            jsonb_build_object('task_id', NEW.id),
            coalesce(NEW.updated_by, auth.uid())
        );
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

-- Create trigger
drop trigger if exists task_activity_trigger on tarefas;
create trigger task_activity_trigger
after insert or update on tarefas
for each row execute function log_task_activity();

-- Function to log card changes
create or replace function log_card_changes()
returns trigger as $$
begin
    -- Status change
    if OLD.status_comercial is distinct from NEW.status_comercial then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.id,
            'status_changed',
            'Status alterado: ' || coalesce(OLD.status_comercial, 'null') || ' → ' || coalesce(NEW.status_comercial, 'null'),
            jsonb_build_object('old_status', OLD.status_comercial, 'new_status', NEW.status_comercial),
            coalesce(NEW.updated_by, auth.uid())
        );
    end if;
    
    -- Owner change (dono_atual_id)
    if OLD.dono_atual_id is distinct from NEW.dono_atual_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.id,
            'owner_changed',
            'Responsável alterado',
            jsonb_build_object('old_owner', OLD.dono_atual_id, 'new_owner', NEW.dono_atual_id),
            coalesce(NEW.updated_by, auth.uid())
        );
    end if;
    
    -- Stage change
    if OLD.pipeline_stage_id is distinct from NEW.pipeline_stage_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.id,
            'stage_changed',
            'Etapa alterada',
            jsonb_build_object('old_stage', OLD.pipeline_stage_id, 'new_stage', NEW.pipeline_stage_id),
            coalesce(NEW.updated_by, auth.uid())
        );
    end if;
    
    return NEW;
end;
$$ language plpgsql security definer;

-- Create trigger
drop trigger if exists card_changes_trigger on cards;
create trigger card_changes_trigger
after update on cards
for each row execute function log_card_changes();
