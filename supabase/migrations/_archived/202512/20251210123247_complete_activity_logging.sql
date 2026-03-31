-- ============================================================================
-- MIGRAÇÃO: Sistema Completo de Logging de Atividades
-- ============================================================================
-- Esta migração adiciona triggers em TODAS as tabelas que precisam de logging
-- Executar no Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. CARDS - CRIAÇÃO (INSERT)
-- ============================================================================
create or replace function log_card_created()
returns trigger as $$
begin
    insert into activities (card_id, tipo, descricao, metadata, created_by)
    values (
        NEW.id,
        'card_created',
        'Card criado: ' || NEW.titulo,
        jsonb_build_object(
            'titulo', NEW.titulo,
            'pipeline_id', NEW.pipeline_id,
            'stage_id', NEW.pipeline_stage_id,
            'produto', NEW.produto
        ),
        coalesce(NEW.created_by, auth.uid())
    );
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists card_created_trigger on cards;
create trigger card_created_trigger
after insert on cards
for each row execute function log_card_created();

-- ============================================================================
-- 2. TAREFAS - CRIAÇÃO, CONCLUSÃO, REABERTURA, EXCLUSÃO
-- ============================================================================
create or replace function log_tarefa_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'task_created',
            'Tarefa criada: ' || NEW.titulo,
            jsonb_build_object(
                'task_id', NEW.id,
                'titulo', NEW.titulo,
                'prioridade', NEW.prioridade,
                'data_vencimento', NEW.data_vencimento
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    elsif TG_OP = 'UPDATE' then
        -- Tarefa concluída
        if OLD.concluida = false and NEW.concluida = true then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'task_completed',
                'Tarefa concluída: ' || NEW.titulo,
                jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo),
                coalesce(NEW.updated_by, auth.uid())
            );
        -- Tarefa reaberta
        elsif OLD.concluida = true and NEW.concluida = false then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'task_reopened',
                'Tarefa reaberta: ' || NEW.titulo,
                jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo),
                coalesce(NEW.updated_by, auth.uid())
            );
        -- Tarefa editada (título ou descrição)
        elsif OLD.titulo is distinct from NEW.titulo or OLD.descricao is distinct from NEW.descricao then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'task_updated',
                'Tarefa editada: ' || NEW.titulo,
                jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo),
                coalesce(NEW.updated_by, auth.uid())
            );
        end if;
    elsif TG_OP = 'DELETE' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            OLD.card_id,
            'task_deleted',
            'Tarefa excluída: ' || OLD.titulo,
            jsonb_build_object('task_id', OLD.id, 'titulo', OLD.titulo),
            auth.uid()
        );
        return OLD;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists tarefa_activity_trigger on tarefas;
drop trigger if exists task_activity_trigger on tarefas;
create trigger tarefa_activity_trigger
after insert or update or delete on tarefas
for each row execute function log_tarefa_activity();

-- ============================================================================
-- 3. NOTAS - CRIAÇÃO, EDIÇÃO, EXCLUSÃO
-- ============================================================================
create or replace function log_nota_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'note_created',
            'Nota adicionada',
            jsonb_build_object(
                'note_id', NEW.id,
                'preview', left(NEW.conteudo, 100)
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    elsif TG_OP = 'UPDATE' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'note_updated',
            'Nota editada',
            jsonb_build_object('note_id', NEW.id, 'preview', left(NEW.conteudo, 100)),
            auth.uid()
        );
    elsif TG_OP = 'DELETE' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            OLD.card_id,
            'note_deleted',
            'Nota excluída',
            jsonb_build_object('note_id', OLD.id),
            auth.uid()
        );
        return OLD;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists nota_activity_trigger on notas;
create trigger nota_activity_trigger
after insert or update or delete on notas
for each row execute function log_nota_activity();

-- ============================================================================
-- 4. CARDS_CONTATOS - VIAJANTE ADICIONADO/REMOVIDO
-- ============================================================================
create or replace function log_cards_contatos_activity()
returns trigger as $$
declare
    contato_nome text;
begin
    if TG_OP = 'INSERT' then
        -- Buscar nome do contato
        select nome into contato_nome from contatos where id = NEW.contato_id;
        
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'traveler_added',
            'Viajante adicionado: ' || coalesce(contato_nome, 'Desconhecido'),
            jsonb_build_object(
                'contato_id', NEW.contato_id,
                'contato_nome', contato_nome,
                'tipo_viajante', NEW.tipo_viajante,
                'tipo_vinculo', NEW.tipo_vinculo
            ),
            auth.uid()
        );
    elsif TG_OP = 'DELETE' then
        -- Buscar nome do contato
        select nome into contato_nome from contatos where id = OLD.contato_id;
        
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            OLD.card_id,
            'traveler_removed',
            'Viajante removido: ' || coalesce(contato_nome, 'Desconhecido'),
            jsonb_build_object(
                'contato_id', OLD.contato_id,
                'contato_nome', contato_nome
            ),
            auth.uid()
        );
        return OLD;
    elsif TG_OP = 'UPDATE' then
        -- Tipo de viajante alterado
        if OLD.tipo_viajante is distinct from NEW.tipo_viajante then
            select nome into contato_nome from contatos where id = NEW.contato_id;
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'traveler_updated',
                'Tipo de viajante alterado: ' || coalesce(contato_nome, 'Desconhecido'),
                jsonb_build_object(
                    'contato_id', NEW.contato_id,
                    'old_tipo', OLD.tipo_viajante,
                    'new_tipo', NEW.tipo_viajante
                ),
                auth.uid()
            );
        end if;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists cards_contatos_activity_trigger on cards_contatos;
create trigger cards_contatos_activity_trigger
after insert or update or delete on cards_contatos
for each row execute function log_cards_contatos_activity();

-- ============================================================================
-- 5. ARQUIVOS - UPLOAD/EXCLUSÃO
-- ============================================================================
create or replace function log_arquivo_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'file_uploaded',
            'Arquivo enviado: ' || NEW.nome_original,
            jsonb_build_object(
                'arquivo_id', NEW.id,
                'nome', NEW.nome_original,
                'mime_type', NEW.mime_type,
                'tamanho', NEW.tamanho_bytes
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    elsif TG_OP = 'DELETE' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            OLD.card_id,
            'file_deleted',
            'Arquivo excluído: ' || OLD.nome_original,
            jsonb_build_object(
                'arquivo_id', OLD.id,
                'nome', OLD.nome_original
            ),
            auth.uid()
        );
        return OLD;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists arquivo_activity_trigger on arquivos;
create trigger arquivo_activity_trigger
after insert or delete on arquivos
for each row execute function log_arquivo_activity();

-- ============================================================================
-- 6. PROPOSALS - CRIAÇÃO/EDIÇÃO
-- ============================================================================
create or replace function log_proposal_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'proposal_created',
            'Proposta criada (v' || coalesce(NEW.version, 1) || ')',
            jsonb_build_object(
                'proposal_id', NEW.id,
                'version', NEW.version,
                'status', NEW.status
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    elsif TG_OP = 'UPDATE' then
        -- Status alterado ou nova versão
        if OLD.status is distinct from NEW.status or OLD.version is distinct from NEW.version then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'proposal_updated',
                'Proposta atualizada (v' || coalesce(NEW.version, 1) || ') - ' || NEW.status,
                jsonb_build_object(
                    'proposal_id', NEW.id,
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'version', NEW.version
                ),
                auth.uid()
            );
        end if;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists proposal_activity_trigger on proposals;
create trigger proposal_activity_trigger
after insert or update on proposals
for each row execute function log_proposal_activity();

-- ============================================================================
-- 7. CONTRATOS - CRIAÇÃO/EDIÇÃO
-- ============================================================================
create or replace function log_contrato_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'contract_created',
            'Contrato criado: ' || NEW.tipo,
            jsonb_build_object(
                'contrato_id', NEW.id,
                'tipo', NEW.tipo,
                'valor_total', NEW.valor_total,
                'status', NEW.status
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    elsif TG_OP = 'UPDATE' then
        -- Status alterado
        if OLD.status is distinct from NEW.status then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'contract_updated',
                'Contrato atualizado: ' || coalesce(OLD.status, 'pendente') || ' → ' || coalesce(NEW.status, 'pendente'),
                jsonb_build_object(
                    'contrato_id', NEW.id,
                    'old_status', OLD.status,
                    'new_status', NEW.status
                ),
                auth.uid()
            );
        -- Data de assinatura
        elsif OLD.data_assinatura is distinct from NEW.data_assinatura and NEW.data_assinatura is not null then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'contract_signed',
                'Contrato assinado',
                jsonb_build_object(
                    'contrato_id', NEW.id,
                    'data_assinatura', NEW.data_assinatura
                ),
                auth.uid()
            );
        end if;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists contrato_activity_trigger on contratos;
create trigger contrato_activity_trigger
after insert or update on contratos
for each row execute function log_contrato_activity();

-- ============================================================================
-- 8. REUNIÕES - CRIAÇÃO/EDIÇÃO/EXCLUSÃO
-- ============================================================================
create or replace function log_reuniao_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'meeting_created',
            'Reunião agendada: ' || NEW.titulo,
            jsonb_build_object(
                'reuniao_id', NEW.id,
                'titulo', NEW.titulo,
                'data_inicio', NEW.data_inicio,
                'local', NEW.local
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    elsif TG_OP = 'UPDATE' then
        if OLD.status is distinct from NEW.status or OLD.data_inicio is distinct from NEW.data_inicio then
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'meeting_updated',
                'Reunião atualizada: ' || NEW.titulo,
                jsonb_build_object(
                    'reuniao_id', NEW.id,
                    'titulo', NEW.titulo,
                    'old_status', OLD.status,
                    'new_status', NEW.status
                ),
                auth.uid()
            );
        end if;
    elsif TG_OP = 'DELETE' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            OLD.card_id,
            'meeting_deleted',
            'Reunião excluída: ' || OLD.titulo,
            jsonb_build_object('reuniao_id', OLD.id, 'titulo', OLD.titulo),
            auth.uid()
        );
        return OLD;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists reuniao_activity_trigger on reunioes;
create trigger reuniao_activity_trigger
after insert or update or delete on reunioes
for each row execute function log_reuniao_activity();

-- ============================================================================
-- 9. MENSAGENS - ENVIO
-- ============================================================================
create or replace function log_mensagem_activity()
returns trigger as $$
begin
    if TG_OP = 'INSERT' and NEW.direcao = 'saida' then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            case NEW.canal
                when 'email' then 'email_sent'
                when 'whatsapp' then 'whatsapp_sent'
                else 'message_sent'
            end,
            'Mensagem enviada via ' || NEW.canal,
            jsonb_build_object(
                'mensagem_id', NEW.id,
                'canal', NEW.canal,
                'preview', left(NEW.conteudo, 100)
            ),
            coalesce(NEW.created_by, auth.uid())
        );
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists mensagem_activity_trigger on mensagens;
create trigger mensagem_activity_trigger
after insert on mensagens
for each row execute function log_mensagem_activity();

-- ============================================================================
-- 10. CARD_OBLIGATIONS - REQUISITO COMPLETADO
-- ============================================================================
create or replace function log_obligation_activity()
returns trigger as $$
declare
    obligation_title text;
begin
    if TG_OP = 'UPDATE' then
        -- Requisito completado
        if OLD.completed = false and NEW.completed = true then
            select title into obligation_title from stage_obligations where id = NEW.obligation_id;
            
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'requirement_completed',
                'Requisito completado: ' || coalesce(obligation_title, 'Requisito'),
                jsonb_build_object(
                    'obligation_id', NEW.obligation_id,
                    'title', obligation_title
                ),
                coalesce(NEW.completed_by, auth.uid())
            );
        -- Requisito desmarcado
        elsif OLD.completed = true and NEW.completed = false then
            select title into obligation_title from stage_obligations where id = NEW.obligation_id;
            
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'requirement_uncompleted',
                'Requisito desmarcado: ' || coalesce(obligation_title, 'Requisito'),
                jsonb_build_object(
                    'obligation_id', NEW.obligation_id,
                    'title', obligation_title
                ),
                auth.uid()
            );
        end if;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists obligation_activity_trigger on card_obligations;
create trigger obligation_activity_trigger
after update on card_obligations
for each row execute function log_obligation_activity();

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'Migração completa! Todos os triggers de atividade foram criados.' as resultado;
