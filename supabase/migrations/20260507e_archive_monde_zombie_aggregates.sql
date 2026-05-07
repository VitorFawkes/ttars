-- ============================================================================
-- MIGRATION: Arquiva 22 itens Monde "zumbi" (agregados pré-04-01 + granulares pós-04-01)
-- Date: 2026-05-07
--
-- Problema:
--   O importador antigo (pré-2026-04) gerava itens com descrição agregada
--   (ex: "Diárias de Hospedagem, Taxa de Serviço") combinando múltiplas
--   categorias da mesma venda Monde numa única linha. Quando a mesma venda
--   foi re-importada em 2026-04-24+ com formato granular (1 linha por item),
--   o importador da época apenas inseria as novas linhas sem arquivar as
--   antigas. Os cleanups subsequentes (20260504l, 20260506e, 20260506f) não
--   pegaram esses casos porque:
--     - 20260504l só arquiva itens de vendas REMOVIDAS do card
--     - 20260506e só pega duplicatas EXATAS (mesmo fornecedor + valor + datas)
--     - 20260506f age só em re-imports FUTUROS, não retroativo
--
--   Regra de negócio: o último arquivo enviado é a verdade — itens anteriores
--   da mesma venda devem ser arquivados.
--
-- Critério de seleção (auditoria client-side em 2026-05-07):
--   Para cada (card_id, monde_venda_num) com itens ativos:
--     - se existem >= 2 itens ativos
--     - E pelo menos 1 criado < 2026-04-01 (formato antigo)
--     - E pelo menos 1 criado >= 2026-04-01 (formato granular novo)
--   Arquivar TODOS os itens criados antes de 2026-04-01 desse grupo.
--
-- Resultado esperado: 22 itens arquivados em 22 cards. Soma de valor zumbi
-- ativo: R$ 1.094.521,52 — esse valor sai do valor_final/receita dos cards.
--
-- Reversível: UPDATE archived_at = NULL nos mesmos IDs.
-- ============================================================================

BEGIN;

UPDATE card_financial_items
SET archived_at = NOW(),
    archived_reason = 'agregado_pre_granular_import'
WHERE id IN (
  '03665729-d99f-4ab2-913d-94e0f63485c7',  -- card=0bdbfac1 venda=68480 R$ 27.479,85
  'aefca87b-afc9-4270-a28f-424e1460986a',  -- card=1fed0629 venda=66626 R$ 10.238,90
  '3bd906bf-7a68-417c-a2fc-fa8ebad910db',  -- card=2a82e508 venda=70961 R$ 187.778,86
  'b80d709d-a25e-48e0-ac86-3c10433f2d7e',  -- card=37f72a76 venda=67659 R$ 15.561,29
  '1fbc8381-3111-4ab0-a8b7-323dabe46568',  -- card=45a3edbc venda=66758 R$ 22.186,86
  'cb4558bd-3df7-4593-aab5-813ff3fe4517',  -- card=4ba114eb venda=67663 R$ 13.441,62
  '9dde26a6-69b3-4de7-b494-96bbcd76d33c',  -- card=537d6d1a venda=69834 R$ 89.612,17
  '82ea0b56-1e4f-4367-8727-4d4cdda99c87',  -- card=71e07c69 venda=67296 R$ 22.442,32
  '63c59a68-2c1f-430e-8250-3c0958ec099f',  -- card=71e3f268 venda=68097 R$ 9.283,50
  'd52a2c7e-2bfa-4a9b-a512-37ed942a9b35',  -- card=72c6d897 venda=67278 R$ 26.287,56
  '58aa6d8c-6cae-4d10-91b2-56c1127bb8a6',  -- card=75a2a55e venda=66651 R$ 29.155,56
  '108bd25c-c8f5-4783-b809-2c6b3bd8c3d4',  -- card=7cd3276e venda=69465 R$ 25.736,66
  'e73bfc62-4026-4123-8e4a-b18eef34e384',  -- card=9c660c64 venda=68451 R$ 4.449,76
  'd69c0fbb-4070-48fd-a7ed-b9a26f524b1c',  -- card=9d1a99a4 venda=66854 R$ 65.982,95
  '93a06520-7310-430a-a00e-78ad294d9e86',  -- card=b4f1666c venda=70204 R$ 13.967,78
  '1af51fad-8748-4e97-8878-b18133db15d7',  -- card=c0386ae7 venda=68082 R$ 109.902,29
  '5fafe3e3-dcca-4149-9fa1-0e6cafae64b2',  -- card=e54bfc13 venda=66635 R$ 18.795,00
  'd0b799ab-c3b4-4918-b9cb-be7f0f06a5b9',  -- card=eaaef327 venda=68012 R$ 18.813,63
  'cc239939-6c4c-4d30-9d84-64772d5986cd',  -- card=ee51d2e0 venda=68781 R$ 38.436,98
  '097d51fc-c4ed-43a0-9ddd-a322c8679366',  -- card=f922c59b venda=70418 R$ 32.668,08
  '8ba3d749-eb32-40d3-afd6-21a9c8a67da1',  -- card=f94f2345 venda=70652 R$ 285.527,04
  'f5fea096-6973-4da8-8d5e-4f8973ac1005'   -- card=fe613bd4 venda=68474 R$ 26.772,86
)
AND archived_at IS NULL;

-- Recalcula valor_final e receita dos 22 cards afetados.
UPDATE cards c
SET valor_final = COALESCE((
      SELECT SUM(sale_value)
      FROM card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    receita = COALESCE((
      SELECT SUM(sale_value - supplier_cost)
      FROM card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    receita_source = 'monde_import',
    updated_at = NOW()
WHERE c.id IN (
  '0bdbfac1-1ee1-4aa6-86df-17c0c663052c',
  '1fed0629-b5b6-4726-8d1a-2310cfac2fc2',
  '2a82e508-dab9-45fa-b38c-75d6e1cfed81',
  '37f72a76-34c6-4757-b4ba-219344864743',
  '45a3edbc-2436-4775-88d5-d020563e9063',
  '4ba114eb-ac93-4920-a691-e44820d654e4',
  '537d6d1a-23fc-4beb-8d57-784622631c90',
  '71e07c69-501c-4710-bc6f-5d4982238a0c',
  '71e3f268-f46b-46ee-bd7b-3ca1b9f55b5b',
  '72c6d897-8c3e-4b87-9239-790b78d0354b',
  '75a2a55e-e04a-4abe-a031-9924459c2608',
  '7cd3276e-e397-4f3a-8869-095887624756',
  '9c660c64-3746-47e9-8fa3-58f3c9d0b6c7',
  '9d1a99a4-30d7-4832-a97b-8ea45961a794',
  'b4f1666c-6710-4cba-9d35-d85db2b67a92',
  'c0386ae7-e2fb-4b67-9905-05c4494e3d74',
  'e54bfc13-bd7b-46a0-92a2-e8e8d125f824',
  'eaaef327-7603-4052-b2b1-66d1bc6caa29',
  'ee51d2e0-8bb9-412f-8e46-e075462f5894',
  'f922c59b-9730-4f0c-b34d-302b32ca7546',
  'f94f2345-9817-4947-ba83-48c3c924e966',
  'fe613bd4-934e-4b58-8317-db02f0554e8a'
);

COMMIT;
