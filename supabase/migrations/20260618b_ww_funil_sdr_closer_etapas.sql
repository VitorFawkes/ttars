-- ============================================================================
-- WEDDINGS — Consolidação do funil SDR + Closer (Handoff Mateus/Vitor 17/06)
-- ============================================================================
-- Deixa o funil exatamente como a spec pede:
--   SDR:   Novo Lead → Tentativa de Contato → Conectado → Reunião Agendada → Reunião Realizada
--   Closer: 1ª Reunião → Em contato → Contrato enviado → Em negociação → Contrato Assinado (is_won)
--
-- ⚠️ ALTO IMPACTO — POR QUE ISTO NÃO É UM SIMPLES TOGGLE DE `ativo`:
--   91% dos cards de Weddings (3.015/3.323) puxam a coluna do ActiveCampaign.
--   O mapa de entrada (integration_stage_map) joga as etapas do Active justo nas
--   colunas que vamos desligar. Desligar sem reescrever o mapa foi o incidente
--   20260616d (revertido). Por isso esta migration REESCREVE o mapa Active↔CRM
--   (entrada + saída) ANTES de desligar, e REALOCA os ~79 leads vivos.
--
-- De-para validado com o Mateus (18/06):
--   • Reunião Agendada / Reunião Realizada = CRM-only (Calendly manda): SEM saída
--     pro Active (mover o card pra lá não muda a etapa do deal no Active).
--   • Entrada: cada etapa do Active cai numa coluna ATIVA equivalente (nunca numa
--     coluna desligada).
--
-- ISOLAMENTO: mexe só em recursos do produto WEDDING (pipeline f4611f84…, org …002)
--   e nas linhas do mapa AC dos pipelines WEDDING (1=SDR, 3=Closer, 12=Elopement).
--   NÃO toca pipeline 8 (SDR Trips) nem nenhuma etapa/mapa do Trips.
--
-- ACOPLAMENTO COM O FRONTEND: a coluna "Contrato Assinado" (is_won) só marca venda
--   ganha ao arrastar DEPOIS do deploy do KanbanBoard (commit desta branch). Por isso
--   esta migration deve subir JUNTO com o deploy (não aplicar solta em prod).
--
-- REVERSÍVEL: toggles de `ativo` + realocação de coluna (sem perda de dado).
--   pipeline_stages NÃO tem updated_at nem slug.
-- ============================================================================

BEGIN;

-- Suprime push/cadência na realocação administrativa dos cards.
SELECT set_config('app.update_source', 'integration', true);

-- ----------------------------------------------------------------------------
-- 1) Criar as 2 etapas novas do SDR (Calendly-driven, sem milestone/win)
-- ----------------------------------------------------------------------------
INSERT INTO public.pipeline_stages (
    id, nome, ordem, ativo, pipeline_id, phase_id, fase, tipo_responsavel,
    target_phase_id, org_id, auto_advance, is_won, is_lost, is_sdr_won,
    is_planner_won, is_pos_won, is_frozen, is_terminal, handoff_compartilhado, milestone_key
) VALUES
 ('d2000000-0000-4000-8000-000000000001', 'Reunião Agendada', 4, true,
  'f4611f84-ce9c-48ad-814b-dcd6081f15db', '545a78f5-e58b-48a7-980a-e2a2652dc755', 'SDR', 'sdr',
  NULL, 'b0000000-0000-0000-0000-000000000002',
  false, false, false, false, false, false, false, false, false, NULL),
 ('d2000000-0000-4000-8000-000000000002', 'Reunião Realizada', 5, true,
  'f4611f84-ce9c-48ad-814b-dcd6081f15db', '545a78f5-e58b-48a7-980a-e2a2652dc755', 'SDR', 'sdr',
  NULL, 'b0000000-0000-0000-0000-000000000002',
  false, false, false, false, false, false, false, false, false, NULL)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, ativo = true,
      phase_id = EXCLUDED.phase_id, fase = EXCLUDED.fase, tipo_responsavel = EXCLUDED.tipo_responsavel;

-- ----------------------------------------------------------------------------
-- 2) Reativar + reordenar as etapas-alvo (antes de realocar/desligar)
-- ----------------------------------------------------------------------------
-- SDR
UPDATE public.pipeline_stages SET ordem = 1, ativo = true WHERE id = '6acb35af-d1a2-48e7-bc48-133907ae9554'; -- Novo Lead
UPDATE public.pipeline_stages SET ordem = 2, ativo = true WHERE id = '81a76623-91a9-4920-be94-84db9fedbae6'; -- Tentativa de Contato (reativar)
UPDATE public.pipeline_stages SET ordem = 3, ativo = true WHERE id = 'b730c3e8-9915-47af-ab7e-00569c6f3d7a'; -- Conectado
-- Closer
UPDATE public.pipeline_stages SET ordem = 1, ativo = true WHERE id = 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1'; -- 1ª Reunião
UPDATE public.pipeline_stages SET ordem = 2, ativo = true WHERE id = 'ef9233fa-9c72-4c54-8995-c02061c4be9f'; -- Em contato
UPDATE public.pipeline_stages SET ordem = 3, ativo = true WHERE id = '016713b1-c7bd-4ad1-bff8-14eff019de5d'; -- Contrato enviado
UPDATE public.pipeline_stages SET ordem = 4, ativo = true WHERE id = '0adf51b3-1d33-45bd-9bc9-484d2568b5f2'; -- Em negociação
UPDATE public.pipeline_stages SET ordem = 5, ativo = true WHERE id = 'f7d81a35-b953-4b3c-8d56-69cc8f937d6a'; -- Contrato Assinado (reativar, is_won)

-- ----------------------------------------------------------------------------
-- 3) Realocar os ~79 leads vivos das colunas que serão desligadas → coluna ativa
--    equivalente. Alvos ALINHADOS com o mapa de ENTRADA (seção 5) p/ o card não
--    quicar de volta no próximo sync do Active.
-- ----------------------------------------------------------------------------
-- SDR
UPDATE public.cards SET pipeline_stage_id = 'b730c3e8-9915-47af-ab7e-00569c6f3d7a' -- → Conectado
 WHERE pipeline_stage_id IN (
   '7b9e0d6e-7ff6-4776-8c6d-f822f83f6af8', -- Follow Up (41)
   'd8587fdb-12f3-40ea-96e2-c9f6272b4ec2', -- StandBy (31)
   'b26cfc4c-203c-4dfa-91a9-51f44cba2951'  -- Reagendamento SDR (0)
 );
UPDATE public.cards SET pipeline_stage_id = '81a76623-91a9-4920-be94-84db9fedbae6' -- → Tentativa de Contato
 WHERE pipeline_stage_id = 'a600629b-9118-42e8-8883-ff001192a2a1';                 -- Primeiro Contato - Qualificação (4)
UPDATE public.cards SET pipeline_stage_id = 'd2000000-0000-4000-8000-000000000002' -- → Reunião Realizada
 WHERE pipeline_stage_id IN (
   'dad8dd9b-58f8-4882-b0ea-366ebaf33638', -- Qualificado pela SDR (1)
   'f83f35bc-d1a3-4e0f-b554-92233e4f7bf0'  -- Aguardando pagamento TAXA (0)
 );
-- Closer
UPDATE public.cards SET pipeline_stage_id = '0adf51b3-1d33-45bd-9bc9-484d2568b5f2' -- → Em negociação
 WHERE pipeline_stage_id IN (
   'c1000000-0000-4000-8000-000000000001', -- Reagendamento Closer (2)
   'c1000000-0000-4000-8000-000000000003', -- Aguardando dados (0)
   'c1000000-0000-4000-8000-000000000004'  -- Standby - Closer (0)
 );

-- ----------------------------------------------------------------------------
-- 4) Desligar as colunas legadas (active=false; preserva a linha p/ histórico)
-- ----------------------------------------------------------------------------
UPDATE public.pipeline_stages SET ativo = false
 WHERE id IN (
   -- SDR legadas
   '7b9e0d6e-7ff6-4776-8c6d-f822f83f6af8', -- Follow Up
   'b26cfc4c-203c-4dfa-91a9-51f44cba2951', -- Reagendamento SDR
   'a600629b-9118-42e8-8883-ff001192a2a1', -- Primeiro Contato - Qualificação
   'f83f35bc-d1a3-4e0f-b554-92233e4f7bf0', -- Aguardando pagamento TAXA
   'd8587fdb-12f3-40ea-96e2-c9f6272b4ec2', -- StandBy
   'dad8dd9b-58f8-4882-b0ea-366ebaf33638', -- Qualificado pela SDR
   -- Closer de espera
   'c1000000-0000-4000-8000-000000000001', -- Reagendamento Closer
   'c1000000-0000-4000-8000-000000000003', -- Aguardando dados
   'c1000000-0000-4000-8000-000000000004'  -- Standby - Closer
 );

-- ----------------------------------------------------------------------------
-- 5) Reescrever o mapa de ENTRADA (Active → CRM). Repontar SÓ as linhas cujo
--    destino vai ficar inativo, p/ uma coluna ATIVA equivalente.
--    integration_id AC = a2141b92-…; pipelines WEDDING: 1 (SDR), 3 (Closer), 12 (Elopement).
-- ----------------------------------------------------------------------------
-- pipe 1 (SDR principal)
UPDATE public.integration_stage_map SET internal_stage_id = '81a76623-91a9-4920-be94-84db9fedbae6', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='1' AND external_stage_id='7';   -- Primeiro Contato → Tentativa de Contato
UPDATE public.integration_stage_map SET internal_stage_id = 'b730c3e8-9915-47af-ab7e-00569c6f3d7a', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='1' AND external_stage_id IN ('3','201','60'); -- Follow Up/Reagend SDR/StandBy → Conectado
UPDATE public.integration_stage_map SET internal_stage_id = 'd2000000-0000-4000-8000-000000000002', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='1' AND external_stage_id IN ('61','8'); -- Aguardando TAXA/Qualificado → Reunião Realizada
-- pipe 12 (Elopement)
UPDATE public.integration_stage_map SET internal_stage_id = 'b730c3e8-9915-47af-ab7e-00569c6f3d7a', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='12' AND external_stage_id='186'; -- Follow up → Conectado
UPDATE public.integration_stage_map SET internal_stage_id = 'd2000000-0000-4000-8000-000000000002', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='12' AND external_stage_id='185'; -- Aguardando pagamento → Reunião Realizada
UPDATE public.integration_stage_map SET internal_stage_id = '016713b1-c7bd-4ad1-bff8-14eff019de5d', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='12' AND external_stage_id='184'; -- Assinatura de contrato → Contrato enviado
-- pipe 3 (Closer): entradas das colunas de espera → Em negociação
UPDATE public.integration_stage_map SET internal_stage_id = '0adf51b3-1d33-45bd-9bc9-484d2568b5f2', updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236' AND direction='inbound' AND pipeline_id='3' AND external_stage_id IN ('163','193','222'); -- Standby/Aguardando/Reagend Closer → Em negociação

-- ----------------------------------------------------------------------------
-- 6) Reescrever o mapa de SAÍDA (CRM → Active) das colunas ATIVAS do SDR.
--    Reunião Agendada/Realizada = CRM-only → SEM saída (não inserir).
--    unique (integration_id, internal_stage_id) → upsert.
-- ----------------------------------------------------------------------------
INSERT INTO public.integration_outbound_stage_map
    (integration_id, org_id, internal_stage_id, external_stage_id, external_stage_name, is_active)
VALUES
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','81a76623-91a9-4920-be94-84db9fedbae6','7','Primeiro Contato - Qualificação',true), -- Tentativa de Contato → 7
    ('a2141b92-561f-4514-92b4-9412a068d236','b0000000-0000-0000-0000-000000000001','b730c3e8-9915-47af-ab7e-00569c6f3d7a','3','Follow Up',true)                       -- Conectado → 3
ON CONFLICT (integration_id, internal_stage_id)
DO UPDATE SET external_stage_id = EXCLUDED.external_stage_id,
              external_stage_name = EXCLUDED.external_stage_name,
              is_active = true, updated_at = now();

-- Desativa a saída das colunas desligadas (não há mais cards nelas; evita ruído).
UPDATE public.integration_outbound_stage_map SET is_active = false, updated_at = now()
 WHERE integration_id='a2141b92-561f-4514-92b4-9412a068d236'
   AND internal_stage_id IN (
     '7b9e0d6e-7ff6-4776-8c6d-f822f83f6af8','b26cfc4c-203c-4dfa-91a9-51f44cba2951',
     'a600629b-9118-42e8-8883-ff001192a2a1','f83f35bc-d1a3-4e0f-b554-92233e4f7bf0',
     'd8587fdb-12f3-40ea-96e2-c9f6272b4ec2','dad8dd9b-58f8-4882-b0ea-366ebaf33638',
     'c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003',
     'c1000000-0000-4000-8000-000000000004'
   );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO (REST, após aplicar):
--   -- SDR ativo (esperado 5, ordem 1..5): Novo Lead, Tentativa de Contato, Conectado, Reunião Agendada, Reunião Realizada
--   pipeline_stages?phase_id=eq.545a78f5-e58b-48a7-980a-e2a2652dc755&ativo=eq.true&select=nome,ordem&order=ordem
--   -- Closer ativo (esperado 5, ordem 1..5, terminando em Contrato Assinado):
--   pipeline_stages?phase_id=eq.c314b65d-4271-4ac2-8b4d-0694630deb3a&ativo=eq.true&select=nome,ordem,is_won&order=ordem
--   -- nenhum card em etapa inativa (esperado 0):
--   cards?pipeline_stage_id=in.(7b9e0d6e…,d8587fdb…,a600629b…,dad8dd9b…,c1000000…0001,…0003,…0004)&select=id
--   -- nenhuma entrada do Active apontando p/ etapa inativa (esperado 0):
--   integration_stage_map?direction=eq.inbound&pipeline_id=in.(1,3,12)&internal_stage_id=in.(<ids inativos>)&select=external_stage_id
-- ============================================================================
