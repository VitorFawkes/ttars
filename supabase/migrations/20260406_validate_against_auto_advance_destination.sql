-- ============================================================================
-- MIGRATION: Trigger valida destino FINAL (resolve auto_advance recursivamente)
-- Date: 2026-04-06
--
-- CONTEXTO
-- Após promover 20260406_enforce_stage_requirements_trigger.sql, descobrimos
-- uma porta dos fundos: handle_card_auto_advance bypassa a validação (porque
-- o caller original já foi validado), MAS isso significa que mover um card
-- via authenticated JWT para um stage com auto_advance=true permite que ele
-- termine em um stage com requisitos não cumpridos.
--
-- Exemplo concreto:
--   1. Authenticated user dá UPDATE pra "Viagem Confirmada (Ganho)" (auto_advance)
--   2. BEFORE trigger valida contra "Viagem Confirmada" — sem regras → passa
--   3. UPDATE acontece
--   4. AFTER trigger handle_card_auto_advance dispara, seta GUC bypass
--   5. UPDATE para "App & Conteúdo em Montagem" (que exige numero_venda_monde)
--   6. BEFORE trigger valida → GUC bypass setado → passa
--   7. Card termina em pos_venda sem numero_venda_monde — BUG
--
-- CORREÇÃO
-- O BEFORE trigger agora resolve o destino REAL: se NEW.pipeline_stage_id
-- tem auto_advance=true, segue a cadeia de auto_advances (mesma lógica do
-- handle_card_auto_advance) até achar o primeiro stage SEM auto_advance, e
-- valida contra esse. Limite de 10 hops para evitar loop.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_stage_requirements_on_card_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_result jsonb;
    v_missing_text text;
    v_jwt_role text;
    v_target_stage_id uuid;
    v_current_stage_id uuid;
    v_stage RECORD;
    v_current_phase_order INT;
    v_next_stage_id UUID;
    v_hops INT := 0;
BEGIN
    -- BYPASS 1: GUC transaction-local
    IF current_setting('app.bypass_stage_requirements', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- BYPASS 2: Service role (edge functions, integrações)
    BEGIN
        v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
        IF v_jwt_role = 'service_role' THEN
            RETURN NEW;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Só atua se o stage realmente mudou
    IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    -- Pula se NEW.pipeline_stage_id for null
    IF NEW.pipeline_stage_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve destino final seguindo cadeia de auto_advance.
    -- Lógica idêntica ao handle_card_auto_advance pra garantir que valida
    -- contra o stage onde o card REALMENTE vai parar.
    v_target_stage_id := NEW.pipeline_stage_id;
    v_current_stage_id := NEW.pipeline_stage_id;

    LOOP
        v_hops := v_hops + 1;
        IF v_hops > 10 THEN
            -- Proteção contra loop infinito (config malformada)
            EXIT;
        END IF;

        SELECT s.auto_advance, s.pipeline_id, s.ordem, s.phase_id
        INTO v_stage
        FROM pipeline_stages s
        WHERE s.id = v_current_stage_id;

        EXIT WHEN v_stage IS NULL OR v_stage.auto_advance IS NOT TRUE;

        SELECT COALESCE(ph.order_index, 999)
        INTO v_current_phase_order
        FROM pipeline_phases ph
        WHERE ph.id = v_stage.phase_id;

        IF v_current_phase_order IS NULL THEN
            v_current_phase_order := 999;
        END IF;

        SELECT s.id INTO v_next_stage_id
        FROM pipeline_stages s
        LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE s.pipeline_id = v_stage.pipeline_id
          AND s.ativo = true
          AND s.id != v_current_stage_id
          AND (
              COALESCE(ph.order_index, 999) > v_current_phase_order
              OR (
                  COALESCE(ph.order_index, 999) = v_current_phase_order
                  AND s.ordem > v_stage.ordem
              )
          )
        ORDER BY COALESCE(ph.order_index, 999), s.ordem
        LIMIT 1;

        EXIT WHEN v_next_stage_id IS NULL;

        v_current_stage_id := v_next_stage_id;
        v_target_stage_id := v_next_stage_id;
        v_next_stage_id := NULL;
    END LOOP;

    -- Validar contra o destino final (não o intermediário)
    v_result := public.validate_stage_requirements(NEW.id, v_target_stage_id);

    IF (v_result->>'valid')::boolean IS FALSE THEN
        v_missing_text := array_to_string(
            ARRAY(SELECT jsonb_array_elements_text(v_result->'missing')),
            ', '
        );

        RAISE EXCEPTION 'STAGE_REQUIREMENTS_VIOLATION'
            USING DETAIL = v_result::text,
                  HINT = 'Campos pendentes para mover este card: ' || v_missing_text,
                  ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$fn$;
