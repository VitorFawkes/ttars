-- ============================================================================
-- WEDDINGS/AC — corrige mapeamento de etapas do CLOSER (off-by-one nos 2 sentidos)
-- ============================================================================
-- Diagnóstico: as etapas do Closer (pipeline AC 3 "Closer Weddings") têm nome
-- idêntico nos dois sistemas, mas o mapeamento estava deslocado em uma casa,
-- tanto na saída (ttars→AC) quanto na entrada (AC→ttars). Ex.: ttars "Em contato"
-- apontava p/ AC "1ª Reunião"; AC "Contrato enviado" caía em ttars "Proposta Enviada".
-- Confirmado contra a API do AC (GET /api/3/dealStages, pipeline group=3).
--
-- Decisão do produto (Mateus, 16/06): "Proposta Enviada" (existe só no ttars) aponta
-- p/ AC "Contrato enviado" (15) na saída; na entrada, AC 15 cai em ttars "Contrato
-- enviado". Etapas sem mapa de saída (Reagendamento Closer, Aguardando dados,
-- Standby - Closer) passam a ter destino no AC.
--
-- Integração AC: a2141b92-561f-4514-92b4-9412a068d236. NÃO move cards existentes —
-- só corrige o mapeamento p/ sincronizações futuras.
-- ============================================================================

-- IDs das etapas do Closer (pipeline ttars Weddings f4611f84-...)
--   1ª Reunião            ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1
--   Em contato            ef9233fa-9c72-4c54-8995-c02061c4be9f
--   Proposta Enviada      b270c71f-c586-4430-b041-a927fd479d39
--   Contrato enviado      016713b1-c7bd-4ad1-bff8-14eff019de5d
--   Em negociação         0adf51b3-1d33-45bd-9bc9-484d2568b5f2
--   Reagendamento Closer  c1000000-0000-4000-8000-000000000001
--   Contrato Assinado     f7d81a35-b953-4b3c-8d56-69cc8f937d6a
--   Aguardando dados      c1000000-0000-4000-8000-000000000003
--   Standby - Closer      c1000000-0000-4000-8000-000000000004

-- ----------------------------------------------------------------------------
-- 1) SAÍDA (ttars → AC): integration_outbound_stage_map
--    unique (integration_id, internal_stage_id) → upsert
-- ----------------------------------------------------------------------------
INSERT INTO public.integration_outbound_stage_map
    (integration_id, org_id, internal_stage_id, external_stage_id, external_stage_name, is_active)
VALUES
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1','13','1ª Reunião',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','ef9233fa-9c72-4c54-8995-c02061c4be9f','14','Em contato',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','016713b1-c7bd-4ad1-bff8-14eff019de5d','15','Contrato enviado',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','c1000000-0000-4000-8000-000000000001','222','Reagendamento Closer',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','c1000000-0000-4000-8000-000000000003','193','Aguardando dados',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','c1000000-0000-4000-8000-000000000004','163','Standby - Closer',true)
ON CONFLICT (integration_id, internal_stage_id)
DO UPDATE SET external_stage_id = EXCLUDED.external_stage_id,
              external_stage_name = EXCLUDED.external_stage_name,
              is_active = true,
              updated_at = now();

-- ----------------------------------------------------------------------------
-- 2) ENTRADA (AC → ttars): integration_stage_map (direction='inbound', pipeline 3)
--    corrige o internal_stage_id de cada etapa deslocada
-- ----------------------------------------------------------------------------
UPDATE public.integration_stage_map SET internal_stage_id='ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1', updated_at=now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='3' AND direction='inbound' AND external_stage_id='13';
UPDATE public.integration_stage_map SET internal_stage_id='ef9233fa-9c72-4c54-8995-c02061c4be9f', updated_at=now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='3' AND direction='inbound' AND external_stage_id='14';
UPDATE public.integration_stage_map SET internal_stage_id='016713b1-c7bd-4ad1-bff8-14eff019de5d', updated_at=now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='3' AND direction='inbound' AND external_stage_id='15';
UPDATE public.integration_stage_map SET internal_stage_id='c1000000-0000-4000-8000-000000000003', updated_at=now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='3' AND direction='inbound' AND external_stage_id='193';
UPDATE public.integration_stage_map SET internal_stage_id='c1000000-0000-4000-8000-000000000004', updated_at=now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='3' AND direction='inbound' AND external_stage_id='163';
UPDATE public.integration_stage_map SET internal_stage_id='c1000000-0000-4000-8000-000000000001', updated_at=now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='3' AND direction='inbound' AND external_stage_id='222';

-- NOTA: AC 16 (Em negociação) e 37 (Ganho) já estavam corretos. AC 221 (Oportunidade
-- futura) fica como está (ttars não tem etapa equivalente no Closer).

NOTIFY pgrst, 'reload schema';
