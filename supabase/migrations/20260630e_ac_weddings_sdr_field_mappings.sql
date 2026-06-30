-- 20260630e_ac_weddings_sdr_field_mappings.sql
-- Mapeia/corrige campos SDR do ActiveCampaign → card Weddings (tabela integration_field_map).
--
-- Contexto: campos do SDR preenchidos no AC não apareciam no card do ttars. Além do bug de
-- identificação de campo do webhook (corrigido na edge function integration-process, que passa a
-- resolver os campos do deal direto na API do AC), faltavam mapeamentos e um estava na fiação errada.
--
-- Correções:
--   1) AC 83 "Motivos de qualificação SDR" estava mapeado p/ ww_sdr_qualificado (ERRADO) → ww_sdr_motivo_qualificacao
--   2) AC 169 "Qualificado para SQL"        → ww_sdr_qualificado            (novo; o campo certo do toggle)
--   3) AC 71  "Enviado pagamento de taxa?"  → ww_sdr_taxa_enviada           (novo)
--   4) AC 303 "Motivo desqualificação SDR"  → ww_sdr_motivo_desqualificacao (novo)
--   5) AC 296 "WW | Link Reunião Teams SDR" → ww_sdr_link_reuniao           (novo)
--
-- Pipelines 1 (SDR), 3 (Closer), 4 (Planejamento) — mesma convenção dos campos irmãos (6/17/20).
-- sync_always=false: preenche só se o campo do card estiver vazio; não sobrescreve edição feita no ttars
-- (ex.: não clobbera o link do Calendly já gravado em ww_sdr_link_reuniao).
-- Idempotente: re-execução não duplica linhas.

BEGIN;

-- 1) Repontar AC 83 (hoje em ww_sdr_qualificado) para o campo correto.
UPDATE public.integration_field_map
SET local_field_key = 'ww_sdr_motivo_qualificacao',
    updated_at = now()
WHERE source = 'active_campaign'
  AND entity_type = 'deal'
  AND external_field_id = '83'
  AND local_field_key = 'ww_sdr_qualificado';

-- 2..5) Inserir os mapeamentos inbound que faltavam (1 linha por pipeline 1/3/4).
INSERT INTO public.integration_field_map
  (source, entity_type, external_field_id, local_field_key, direction, integration_id,
   external_pipeline_id, sync_always, is_active, storage_location, db_column_name, org_id)
SELECT 'active_campaign', 'deal', m.external_field_id, m.local_field_key, 'inbound',
       'a2141b92-561f-4514-92b4-9412a068d236', p.pipe, false, true, 'produto_data', NULL,
       'a0000000-0000-0000-0000-000000000001'
FROM (VALUES
    ('169', 'ww_sdr_qualificado'),
    ('71',  'ww_sdr_taxa_enviada'),
    ('303', 'ww_sdr_motivo_desqualificacao'),
    ('296', 'ww_sdr_link_reuniao')
  ) AS m(external_field_id, local_field_key)
CROSS JOIN (VALUES ('1'), ('3'), ('4')) AS p(pipe)
WHERE NOT EXISTS (
    SELECT 1 FROM public.integration_field_map x
    WHERE x.source = 'active_campaign'
      AND x.entity_type = 'deal'
      AND x.external_field_id = m.external_field_id
      AND COALESCE(x.external_pipeline_id, '') = p.pipe
);

COMMIT;
