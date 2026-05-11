-- Uniformiza configs de campo entre etapas-irmãs da mesma fase.
--
-- Contexto: até esta migration, era possível um mesmo campo ter regras
-- diferentes (visível/obrigatório/secundário/cabeçalho) entre etapas dentro de
-- uma mesma fase, gerando o que a UI chamava de "divergência". A partir da
-- versão atual do Pipeline Studio, "Campos por fase" é a única superfície de
-- edição e ela escreve em batch para todas as etapas-irmãs — divergência só
-- existe em dados antigos.
--
-- Regra escolhida: para cada (org_id, phase_id, field_key), pegamos o config
-- da ÚLTIMA etapa da fase (maior `ordem`) e replicamos em todas as etapas
-- da mesma fase. Mesmo critério que o antigo botão "Normalizar" usava.
--
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- Não-destrutiva: nenhum DROP ou DELETE.

BEGIN;

WITH last_stage_per_phase AS (
    -- Para cada fase, escolhe a etapa com maior `ordem` (a "canônica")
    SELECT DISTINCT ON (s.phase_id)
        s.phase_id,
        s.id AS stage_id
    FROM pipeline_stages s
    WHERE s.phase_id IS NOT NULL
    ORDER BY s.phase_id, s.ordem DESC NULLS LAST, s.id DESC
),
canonical AS (
    -- Pega configs já existentes na etapa canônica. org_id vem do próprio sfc.
    SELECT
        lsp.phase_id,
        sfc.org_id,
        sfc.field_key,
        sfc.is_visible,
        sfc.is_required,
        sfc.is_secondary,
        sfc.show_in_header,
        sfc.custom_label,
        sfc.requirement_type,
        sfc.is_blocking
    FROM last_stage_per_phase lsp
    JOIN stage_field_config sfc ON sfc.stage_id = lsp.stage_id
    WHERE sfc.field_key IS NOT NULL
)
INSERT INTO stage_field_config (
    stage_id,
    field_key,
    org_id,
    is_visible,
    is_required,
    is_secondary,
    show_in_header,
    custom_label,
    requirement_type,
    is_blocking
)
SELECT
    s.id,
    c.field_key,
    c.org_id,
    c.is_visible,
    c.is_required,
    c.is_secondary,
    c.show_in_header,
    c.custom_label,
    c.requirement_type,
    c.is_blocking
FROM canonical c
JOIN pipeline_stages s ON s.phase_id = c.phase_id
ON CONFLICT (stage_id, field_key) DO UPDATE SET
    is_visible       = EXCLUDED.is_visible,
    is_required      = EXCLUDED.is_required,
    is_secondary     = EXCLUDED.is_secondary,
    show_in_header   = EXCLUDED.show_in_header,
    custom_label     = EXCLUDED.custom_label,
    requirement_type = EXCLUDED.requirement_type,
    is_blocking      = EXCLUDED.is_blocking,
    updated_at       = now();

-- Auditoria pós-execução: deve retornar 0
DO $$
DECLARE
    divergent_count integer;
BEGIN
    SELECT COUNT(*) INTO divergent_count
    FROM (
        SELECT s.phase_id, sfc.field_key, sfc.org_id,
            COUNT(DISTINCT (sfc.is_visible, sfc.is_required, sfc.show_in_header, sfc.is_secondary)) AS cfgs
        FROM stage_field_config sfc
        JOIN pipeline_stages s ON s.id = sfc.stage_id
        WHERE s.phase_id IS NOT NULL
        GROUP BY s.phase_id, sfc.field_key, sfc.org_id
        HAVING COUNT(DISTINCT (sfc.is_visible, sfc.is_required, sfc.show_in_header, sfc.is_secondary)) > 1
    ) divergent;

    IF divergent_count > 0 THEN
        RAISE WARNING 'Apos normalizacao ainda restam % combinacoes divergentes', divergent_count;
    END IF;
END;
$$;

COMMIT;
