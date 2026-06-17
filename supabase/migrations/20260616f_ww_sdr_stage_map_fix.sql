-- ============================================================================
-- WEDDINGS/AC — corrige mapeamento de etapas do SDR (saída + entrada)
-- ============================================================================
-- A ENTRADA (AC pipe 1 → ttars) já estava correta (cai nas etapas visíveis).
-- A SAÍDA estava quebrada: os mapas de saída estavam grudados em etapas
-- ESCONDIDAS (Tentativa de Contato→3, Qualificação Feita→8, Taxa Paga→61),
-- enquanto as etapas VISÍVEIS que a equipe usa não tinham saída → mover lead
-- pra elas no ttars não refletia no Active.
--
-- MAPEAMENTO PURO: mexe só em integration_outbound_stage_map / integration_stage_map.
-- NÃO move cards. NÃO altera pipeline_stages.ativo. (Lição do incidente da
-- consolidação 20260616d, revertido.)
--
-- "Conectado" → AC 7 (Primeiro Contato): decisão do usuário (16/06), mantido.
-- Integração AC: a2141b92-... | org das stage maps: b0000000-...0001 (Trips, dona
-- da integração compartilhada).
-- ============================================================================

-- 1) SAÍDA: ligar as etapas VISÍVEIS à sua etapa no Active (upsert)
INSERT INTO public.integration_outbound_stage_map
    (integration_id, org_id, internal_stage_id, external_stage_id, external_stage_name, is_active)
VALUES
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','7b9e0d6e-7ff6-4776-8c6d-f822f83f6af8','3','Follow Up',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','b26cfc4c-203c-4dfa-91a9-51f44cba2951','201','Reagendamento SDR',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','a600629b-9118-42e8-8883-ff001192a2a1','7','Primeiro Contato - Qualificação',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','f83f35bc-d1a3-4e0f-b554-92233e4f7bf0','61','Aguardando pagamento TAXA',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','d8587fdb-12f3-40ea-96e2-c9f6272b4ec2','60','StandBy',true),
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','dad8dd9b-58f8-4882-b0ea-366ebaf33638','8','Qualificado pela SDR',true)
ON CONFLICT (integration_id, internal_stage_id)
DO UPDATE SET external_stage_id=EXCLUDED.external_stage_id, external_stage_name=EXCLUDED.external_stage_name,
              is_active=true, updated_at=now();
-- (Novo Lead 6acb35af→1 e Conectado b730c3e8→7 já existem e ficam como estão)

-- 2) SAÍDA: remover mapas das etapas ESCONDIDAS (o conceito agora vive na visível)
DELETE FROM public.integration_outbound_stage_map
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236'
   AND internal_stage_id IN (
     '81a76623-91a9-4920-be94-84db9fedbae6',  -- Tentativa de Contato (escondida) → era 3
     'a6d36ab5-5653-4999-930d-a7957dc36cbd',  -- Qualificação Feita (escondida) → era 8
     '94d04a32-ee59-43f1-8f81-82dce13de5e6'   -- Taxa Paga (escondida) → era 61
   );

-- 3) ENTRADA: repontar Elopment (pipe 12) de etapa escondida → visível equivalente
UPDATE public.integration_stage_map SET internal_stage_id='7b9e0d6e-7ff6-4776-8c6d-f822f83f6af8', updated_at=now()  -- Follow Up
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='12' AND direction='inbound' AND external_stage_id='186';
UPDATE public.integration_stage_map SET internal_stage_id='f83f35bc-d1a3-4e0f-b554-92233e4f7bf0', updated_at=now()  -- Aguardando pagamento TAXA
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND pipeline_id='12' AND direction='inbound' AND external_stage_id='185';
-- (entrada do pipe 1 fica intacta — já estava correta)

NOTIFY pgrst, 'reload schema';
