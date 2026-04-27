-- Sistema de auditoria de mudanças em contatos.
-- Cada UPDATE em contatos com campos relevantes alterados registra uma linha
-- com {antes, depois} de cada campo, autor e fonte.
--
-- Fontes detectadas:
--   manual         — UPDATE feito pela UI (default)
--   monde_import   — UPDATE feito pelo import inbound do Monde
--                    (detecta via current_setting('app.monde_sync_source'))
--   system         — fallback para chamadas sem auth.uid() e sem source override
--
-- Volume: 1 linha por update com mudança em campo whitelisted.
-- Cleanup futuro pode ser via cron (ex: prune > 1 ano).

BEGIN;

-- 1. Tabela
CREATE TABLE IF NOT EXISTS public.contato_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted', 'restored')),
  changed_fields JSONB,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contato_change_log IS
  'Auditoria de mudanças em contatos. Por-org. Populada por trigger trg_contato_change_log.';

CREATE INDEX IF NOT EXISTS idx_contato_change_log_contato
  ON public.contato_change_log(contato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contato_change_log_org
  ON public.contato_change_log(org_id, created_at DESC);

-- 2. RLS — leitura por org, escrita só via trigger (service_role)
ALTER TABLE public.contato_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contato_change_log_select ON public.contato_change_log;
CREATE POLICY contato_change_log_select
  ON public.contato_change_log
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

DROP POLICY IF EXISTS contato_change_log_service ON public.contato_change_log;
CREATE POLICY contato_change_log_service
  ON public.contato_change_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Trigger function
CREATE OR REPLACE FUNCTION public.log_contato_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_changes JSONB := '{}'::JSONB;
  v_source TEXT;
  v_event TEXT;
  v_user UUID;
BEGIN
  -- Source detection
  IF current_setting('app.monde_sync_source', true) = 'import' THEN
    v_source := 'monde_import';
  ELSE
    v_source := COALESCE(NULLIF(current_setting('app.contato_change_source', true), ''), 'manual');
  END IF;

  v_user := auth.uid();
  IF v_user IS NULL THEN
    -- Sem JWT (trigger rodando via service_role) e source não foi setado: marca como system
    IF v_source = 'manual' THEN
      v_source := 'system';
    END IF;
  END IF;

  -- INSERT — registra criação
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contato_change_log (
      contato_id, org_id, event_type, changed_fields, changed_by, source
    ) VALUES (
      NEW.id,
      NEW.org_id,
      'created',
      jsonb_build_object(
        'nome', NEW.nome,
        'sobrenome', NEW.sobrenome,
        'email', NEW.email,
        'telefone', NEW.telefone
      ),
      v_user,
      v_source
    );
    RETURN NEW;
  END IF;

  -- UPDATE — soft delete e restore têm event_type próprios
  IF TG_OP = 'UPDATE' THEN
    -- Soft delete
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      INSERT INTO public.contato_change_log (
        contato_id, org_id, event_type, changed_fields, changed_by, source
      ) VALUES (
        NEW.id, NEW.org_id, 'deleted', NULL, v_user, v_source
      );
      RETURN NEW;
    END IF;

    -- Restore
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.contato_change_log (
        contato_id, org_id, event_type, changed_fields, changed_by, source
      ) VALUES (
        NEW.id, NEW.org_id, 'restored', NULL, v_user, v_source
      );
      RETURN NEW;
    END IF;

    -- Updates: detecta cada campo whitelisted
    IF OLD.nome IS DISTINCT FROM NEW.nome THEN
      v_changes := v_changes || jsonb_build_object('nome', jsonb_build_object('from', OLD.nome, 'to', NEW.nome));
    END IF;
    IF OLD.sobrenome IS DISTINCT FROM NEW.sobrenome THEN
      v_changes := v_changes || jsonb_build_object('sobrenome', jsonb_build_object('from', OLD.sobrenome, 'to', NEW.sobrenome));
    END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN
      v_changes := v_changes || jsonb_build_object('email', jsonb_build_object('from', OLD.email, 'to', NEW.email));
    END IF;
    IF OLD.telefone IS DISTINCT FROM NEW.telefone THEN
      v_changes := v_changes || jsonb_build_object('telefone', jsonb_build_object('from', OLD.telefone, 'to', NEW.telefone));
    END IF;
    IF OLD.cpf IS DISTINCT FROM NEW.cpf THEN
      v_changes := v_changes || jsonb_build_object('cpf', jsonb_build_object('from', OLD.cpf, 'to', NEW.cpf));
    END IF;
    IF OLD.rg IS DISTINCT FROM NEW.rg THEN
      v_changes := v_changes || jsonb_build_object('rg', jsonb_build_object('from', OLD.rg, 'to', NEW.rg));
    END IF;
    IF OLD.passaporte IS DISTINCT FROM NEW.passaporte THEN
      v_changes := v_changes || jsonb_build_object('passaporte', jsonb_build_object('from', OLD.passaporte, 'to', NEW.passaporte));
    END IF;
    IF OLD.passaporte_validade IS DISTINCT FROM NEW.passaporte_validade THEN
      v_changes := v_changes || jsonb_build_object('passaporte_validade', jsonb_build_object('from', OLD.passaporte_validade, 'to', NEW.passaporte_validade));
    END IF;
    IF OLD.data_nascimento IS DISTINCT FROM NEW.data_nascimento THEN
      v_changes := v_changes || jsonb_build_object('data_nascimento', jsonb_build_object('from', OLD.data_nascimento, 'to', NEW.data_nascimento));
    END IF;
    IF OLD.sexo IS DISTINCT FROM NEW.sexo THEN
      v_changes := v_changes || jsonb_build_object('sexo', jsonb_build_object('from', OLD.sexo, 'to', NEW.sexo));
    END IF;
    IF OLD.tipo_pessoa IS DISTINCT FROM NEW.tipo_pessoa THEN
      v_changes := v_changes || jsonb_build_object('tipo_pessoa', jsonb_build_object('from', OLD.tipo_pessoa, 'to', NEW.tipo_pessoa));
    END IF;
    IF OLD.tipo_cliente IS DISTINCT FROM NEW.tipo_cliente THEN
      v_changes := v_changes || jsonb_build_object('tipo_cliente', jsonb_build_object('from', OLD.tipo_cliente, 'to', NEW.tipo_cliente));
    END IF;
    IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN
      v_changes := v_changes || jsonb_build_object('observacoes', jsonb_build_object('from', OLD.observacoes, 'to', NEW.observacoes));
    END IF;
    IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN
      v_changes := v_changes || jsonb_build_object('endereco', jsonb_build_object('from', OLD.endereco, 'to', NEW.endereco));
    END IF;
    IF OLD.origem IS DISTINCT FROM NEW.origem THEN
      v_changes := v_changes || jsonb_build_object('origem', jsonb_build_object('from', OLD.origem, 'to', NEW.origem));
    END IF;
    IF OLD.origem_detalhe IS DISTINCT FROM NEW.origem_detalhe THEN
      v_changes := v_changes || jsonb_build_object('origem_detalhe', jsonb_build_object('from', OLD.origem_detalhe, 'to', NEW.origem_detalhe));
    END IF;
    IF OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id THEN
      v_changes := v_changes || jsonb_build_object('responsavel_id', jsonb_build_object('from', OLD.responsavel_id, 'to', NEW.responsavel_id));
    END IF;

    IF v_changes <> '{}'::JSONB THEN
      INSERT INTO public.contato_change_log (
        contato_id, org_id, event_type, changed_fields, changed_by, source
      ) VALUES (
        NEW.id, NEW.org_id, 'updated', v_changes, v_user, v_source
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Triggers
DROP TRIGGER IF EXISTS trg_contato_change_log_insert ON public.contatos;
CREATE TRIGGER trg_contato_change_log_insert
  AFTER INSERT ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.log_contato_change();

DROP TRIGGER IF EXISTS trg_contato_change_log_update ON public.contatos;
CREATE TRIGGER trg_contato_change_log_update
  AFTER UPDATE ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.log_contato_change();

-- 5. RPC para a UI buscar log com nome do autor
CREATE OR REPLACE FUNCTION public.get_contato_change_log(p_contato_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  changed_fields JSONB,
  source TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.event_type,
    l.changed_fields,
    l.source,
    l.changed_by,
    p.nome AS changed_by_name,
    l.created_at
  FROM public.contato_change_log l
  LEFT JOIN public.profiles p ON p.id = l.changed_by
  WHERE l.contato_id = p_contato_id
    AND (l.org_id = requesting_org_id() OR l.org_id = requesting_parent_org_id())
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_contato_change_log(UUID, INT) TO authenticated;

COMMIT;
