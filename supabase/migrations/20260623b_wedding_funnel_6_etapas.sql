-- Reshape da fase pos_venda do pipeline WEDDING para as 6 ETAPAS de Planejamento
-- (decisão Vitor 23/06, Opção A: "minhas 6 etapas mandam"). Faz o funil de
-- verdade virar a régua do board, pra arrastar passar a mover o casamento real.
--
-- Os ~25 casais que hoje estão em etapas de PRODUÇÃO (Fornecedores em Contratação
-- = 23, Pós-casamento = 2) vão pra uma etapa "Produção (em construção)" FORA do
-- quadro de Planejamento, até a área de Produção existir (decisão Vitor 23/06).
--
-- SÓ renomeações/reordenação dos 7 stages existentes + 1 move de cards. NENHUM
-- insert/delete de stage; NENHUM card perdido (a fase pos_venda mantém os 115).
-- Os nomes batem EXATAMENTE com PLANEJAMENTO_LABEL (src/hooks/planejamento/types.ts).
--
-- ⚠️ Pareada com o frontend (board lê/move stage real via mover_card e esconde a
-- Produção): aplicar JUNTO com o deploy do frontend. Staging defasado → validar em prod.
-- Pipeline WEDDING: f4611f84-ce9c-48ad-814b-dcd6081f15db · fase pos_venda: 775a7a1c-3959-4e0d-8454-1063c4fba144

BEGIN;

-- 1) Mover os 2 casais de "Pós-casamento" pra "Fornecedores em Contratação"
--    (que vira a etapa Produção holding) — antes de repurposar o stage Pós-casamento.
UPDATE public.cards
   SET pipeline_stage_id = '0f543791-92a6-4f34-b55e-785b854061f0'   -- Fornecedores → Produção holding
 WHERE pipeline_stage_id = '4324a8c5-bb01-4d41-991e-4d2d39155338'   -- Pós-casamento
   AND deleted_at IS NULL;

-- 2) Os 6 stages de PLANEJAMENTO (board), na ordem das 6 etapas:
UPDATE public.pipeline_stages SET nome='Boas-vindas & Preparação',                  ordem=1 WHERE id='ada5a419-1a98-4deb-9098-808507a3415e'; -- era Boas-vindas e Questionário (64)
UPDATE public.pipeline_stages SET nome='Primeira Reunião & Onboarding',             ordem=2 WHERE id='cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c'; -- era Concepção (3)
UPDATE public.pipeline_stages SET nome='Ciclo de Definição',                         ordem=3 WHERE id='d8244643-ba68-44a5-b34c-538433eb0e10'; -- era Casamento Realizado (0)
UPDATE public.pipeline_stages SET nome='Reserva do Evento & Documentação',          ordem=4 WHERE id='4324a8c5-bb01-4d41-991e-4d2d39155338'; -- era Pós-casamento (2 cards movidos p/ Produção)
UPDATE public.pipeline_stages SET nome='Bloqueio de Hospedagem & Ação Promocional', ordem=5 WHERE id='b2c94cad-0ff9-4797-92cf-f6c48e9bc458'; -- era Convidados e Logística (23)
UPDATE public.pipeline_stages SET nome='Programação Final',                          ordem=6 WHERE id='a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'; -- era Pré-evento (0)

-- 3) Etapa Produção holding (FORA do board) — recebe os 23 + 2 = 25 casais de produção:
UPDATE public.pipeline_stages SET nome='Produção (em construção)',                  ordem=7 WHERE id='0f543791-92a6-4f34-b55e-785b854061f0'; -- era Fornecedores em Contratação (23) + 2 movidos

-- 4) Libera o AVANÇO no board: a trava nativa de hoje é por campo ww_plan_* (que a
--    planejadora NÃO preenche — ela usa outros campos), então travaria o arraste
--    (mover_card → validate_transition). A trava de verdade vira o CHECKLIST da etapa
--    (visão da Diana, fase seguinte). Por ora, tira o bloqueio-por-campo das etapas pos_venda WEDDING.
UPDATE public.stage_field_config f
   SET is_blocking = false
  FROM public.pipeline_stages s
  JOIN public.pipeline_phases ph ON ph.id = s.phase_id
 WHERE f.stage_id = s.id
   AND s.pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
   AND ph.slug = 'pos_venda'
   AND f.is_blocking = true;

COMMIT;

-- ── Validação: as 6 etapas + a Produção com nome/ordem certos; nenhum card órfão ──
DO $$
DECLARE
  v_planning INT;
  v_prod_nome TEXT;
  v_orfaos INT;
BEGIN
  -- 6 etapas de planejamento com os nomes/ordem esperados (ordem 1..6)
  SELECT count(*) INTO v_planning FROM public.pipeline_stages
   WHERE pipeline_id='f4611f84-ce9c-48ad-814b-dcd6081f15db'
     AND nome IN ('Boas-vindas & Preparação','Primeira Reunião & Onboarding','Ciclo de Definição',
                  'Reserva do Evento & Documentação','Bloqueio de Hospedagem & Ação Promocional','Programação Final')
     AND ordem BETWEEN 1 AND 6;
  IF v_planning <> 6 THEN RAISE EXCEPTION 'reshape: esperava 6 etapas de planejamento, achei %', v_planning; END IF;

  SELECT nome INTO v_prod_nome FROM public.pipeline_stages WHERE id='0f543791-92a6-4f34-b55e-785b854061f0';
  IF v_prod_nome <> 'Produção (em construção)' THEN RAISE EXCEPTION 'reshape: etapa Produção holding não renomeada (%)', v_prod_nome; END IF;

  -- nenhum casal ficou no stage Pós-casamento antigo (todos movidos)
  SELECT count(*) INTO v_orfaos FROM public.cards WHERE pipeline_stage_id='4324a8c5-bb01-4d41-991e-4d2d39155338' AND deleted_at IS NULL;
  IF v_orfaos <> 0 THEN RAISE EXCEPTION 'reshape: % casais ainda no Pós-casamento (deviam ter ido p/ Produção)', v_orfaos; END IF;

  RAISE NOTICE 'reshape WEDDING 6 etapas: OK (6 etapas de planejamento + Produção holding)';
END $$;
