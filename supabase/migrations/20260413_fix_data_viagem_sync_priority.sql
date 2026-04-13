-- Fix: data_viagem_inicio/fim devem refletir o "first date" exibido no frontend
--
-- Problema: o trigger sync_card_dates_from_json sincronizava data_viagem_inicio
-- a partir de produto_data->'epoca_viagem'->>'inicio' (campo legado). Mas o
-- frontend (renderTripDate em KanbanCard.tsx) prioriza
-- data_inicio > start > inicio. Resultado: cards com 'start' diferente de
-- 'inicio' (ex: card editado em duas convenções diferentes) ficavam com display
-- correto mas data_viagem_inicio errado, causando ordenação fora de ordem no
-- Kanban.
--
-- Fix em 3 partes:
--   1. Reescreve sync_card_dates_from_json com a mesma priority do frontend.
--   2. Reescreve sync_travel_normalized_columns para também extrair
--      data_viagem_inicio/fim quando tipo='mes' ou 'range_meses' (usa dia 1 do
--      mês/ano), de forma consistente com a chave de ordenação esperada.
--   3. Backfill: recalcula data_viagem_inicio/fim para todos os cards onde a
--      coluna divergir do valor canônico derivado de epoca_viagem.

-- ============================================================
-- 1. Trigger sync_card_dates_from_json — nova priority
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_card_dates_from_json()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    ev jsonb;
    canonical_inicio text;
    canonical_fim text;
BEGIN
    IF NEW.produto_data IS DISTINCT FROM OLD.produto_data THEN
        ev := NEW.produto_data->'epoca_viagem';
        IF ev IS NOT NULL THEN
            -- Priority idêntica à do renderTripDate no frontend:
            -- data_inicio > start > inicio
            canonical_inicio := COALESCE(
                ev->>'data_inicio',
                ev->>'start',
                ev->>'inicio'
            );
            canonical_fim := COALESCE(
                ev->>'data_fim',
                ev->>'end',
                ev->>'fim'
            );

            -- Também derivar de mes_inicio + ano para tipo='mes'/'range_meses'
            -- quando não houver data exata (FlexibleDateField legado).
            IF canonical_inicio IS NULL
               AND (ev->>'tipo') IN ('mes', 'range_meses')
               AND (ev->>'ano') IS NOT NULL
               AND (ev->>'mes_inicio') IS NOT NULL THEN
                canonical_inicio := (ev->>'ano') || '-' || lpad(ev->>'mes_inicio', 2, '0') || '-01';
            END IF;
            IF canonical_fim IS NULL
               AND (ev->>'tipo') = 'range_meses'
               AND (ev->>'ano') IS NOT NULL
               AND (ev->>'mes_fim') IS NOT NULL THEN
                canonical_fim := (ev->>'ano') || '-' || lpad(ev->>'mes_fim', 2, '0') || '-01';
            END IF;

            IF canonical_inicio IS NOT NULL
               AND (NEW.data_viagem_inicio IS NULL
                    OR NEW.data_viagem_inicio::text != canonical_inicio) THEN
                NEW.data_viagem_inicio := canonical_inicio::date;
            END IF;
            IF canonical_fim IS NOT NULL
               AND (NEW.data_viagem_fim IS NULL
                    OR NEW.data_viagem_fim::text != canonical_fim) THEN
                NEW.data_viagem_fim := canonical_fim::date;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. Trigger sync_travel_normalized_columns — mesma priority
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_travel_normalized_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    epoca jsonb;
    duracao jsonb;
    orcamento jsonb;
    canonical_inicio text;
    canonical_fim text;
BEGIN
    epoca := NEW.produto_data -> 'epoca_viagem';
    duracao := NEW.produto_data -> 'duracao_viagem';
    orcamento := NEW.produto_data -> 'orcamento';

    IF epoca IS NOT NULL THEN
        NEW.epoca_tipo := epoca ->> 'tipo';
        NEW.epoca_mes_inicio := (epoca ->> 'mes_inicio')::smallint;
        NEW.epoca_mes_fim := (epoca ->> 'mes_fim')::smallint;
        NEW.epoca_ano := (epoca ->> 'ano')::smallint;

        canonical_inicio := COALESCE(
            epoca->>'data_inicio',
            epoca->>'start',
            epoca->>'inicio'
        );
        canonical_fim := COALESCE(
            epoca->>'data_fim',
            epoca->>'end',
            epoca->>'fim'
        );

        IF canonical_inicio IS NULL
           AND (epoca->>'tipo') IN ('mes', 'range_meses')
           AND (epoca->>'ano') IS NOT NULL
           AND (epoca->>'mes_inicio') IS NOT NULL THEN
            canonical_inicio := (epoca->>'ano') || '-' || lpad(epoca->>'mes_inicio', 2, '0') || '-01';
        END IF;
        IF canonical_fim IS NULL
           AND (epoca->>'tipo') = 'range_meses'
           AND (epoca->>'ano') IS NOT NULL
           AND (epoca->>'mes_fim') IS NOT NULL THEN
            canonical_fim := (epoca->>'ano') || '-' || lpad(epoca->>'mes_fim', 2, '0') || '-01';
        END IF;

        IF canonical_inicio IS NOT NULL THEN
            NEW.data_viagem_inicio := canonical_inicio::date;
        END IF;
        IF canonical_fim IS NOT NULL THEN
            NEW.data_viagem_fim := canonical_fim::date;
        END IF;
    END IF;

    IF duracao IS NOT NULL THEN
        NEW.duracao_dias_min := (duracao ->> 'dias_min')::smallint;
        NEW.duracao_dias_max := (duracao ->> 'dias_max')::smallint;
    END IF;

    IF orcamento IS NOT NULL THEN
        NEW.valor_estimado := COALESCE(
            (orcamento ->> 'total_calculado')::numeric,
            (orcamento ->> 'valor')::numeric,
            NEW.valor_estimado
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================
-- 3. Backfill — recalcula data_viagem_inicio/fim onde divergem
-- ============================================================
WITH canonical AS (
    SELECT
        c.id,
        COALESCE(
            c.produto_data->'epoca_viagem'->>'data_inicio',
            c.produto_data->'epoca_viagem'->>'start',
            c.produto_data->'epoca_viagem'->>'inicio',
            CASE
                WHEN c.produto_data->'epoca_viagem'->>'tipo' IN ('mes', 'range_meses')
                 AND c.produto_data->'epoca_viagem'->>'ano' IS NOT NULL
                 AND c.produto_data->'epoca_viagem'->>'mes_inicio' IS NOT NULL
                THEN (c.produto_data->'epoca_viagem'->>'ano') || '-' || lpad(c.produto_data->'epoca_viagem'->>'mes_inicio', 2, '0') || '-01'
            END
        ) AS canonical_inicio,
        COALESCE(
            c.produto_data->'epoca_viagem'->>'data_fim',
            c.produto_data->'epoca_viagem'->>'end',
            c.produto_data->'epoca_viagem'->>'fim',
            CASE
                WHEN c.produto_data->'epoca_viagem'->>'tipo' = 'range_meses'
                 AND c.produto_data->'epoca_viagem'->>'ano' IS NOT NULL
                 AND c.produto_data->'epoca_viagem'->>'mes_fim' IS NOT NULL
                THEN (c.produto_data->'epoca_viagem'->>'ano') || '-' || lpad(c.produto_data->'epoca_viagem'->>'mes_fim', 2, '0') || '-01'
            END
        ) AS canonical_fim
    FROM cards c
    WHERE c.deleted_at IS NULL
      AND c.produto_data->'epoca_viagem' IS NOT NULL
)
UPDATE cards c
SET
    data_viagem_inicio = COALESCE(canonical.canonical_inicio::date, c.data_viagem_inicio),
    data_viagem_fim    = COALESCE(canonical.canonical_fim::date,    c.data_viagem_fim)
FROM canonical
WHERE c.id = canonical.id
  AND (
       (canonical.canonical_inicio IS NOT NULL
        AND (c.data_viagem_inicio IS NULL
             OR substring(c.data_viagem_inicio::text FROM 1 FOR 10) != substring(canonical.canonical_inicio FROM 1 FOR 10)))
    OR (canonical.canonical_fim IS NOT NULL
        AND (c.data_viagem_fim IS NULL
             OR substring(c.data_viagem_fim::text FROM 1 FOR 10) != substring(canonical.canonical_fim FROM 1 FOR 10)))
  );
