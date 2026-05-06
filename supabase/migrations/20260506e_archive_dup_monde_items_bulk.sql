-- ============================================================================
-- MIGRATION: Arquiva 87 itens duplicados do Monde em 47 cards
-- Date: 2026-05-06
--
-- Problema:
--   Antes da migration 20260505b (trigger com idempotência) e antes do
--   hardening do bulk_import_financial_items (esta sprint), re-syncs da
--   mesma venda Monde criavam cópias dos itens em vez de atualizar. Hoje
--   há 87 itens duplicados ativos em 47 cards.
--
-- Critério de seleção (gerado por análise client-side em 2026-05-06):
--   Para cada grupo (card_id + monde_venda_num + fornecedor + sale_value
--   + data_inicio + data_fim) com mais de 1 item ativo, manter:
--     1. O item mais novo (maior created_at), OU
--     2. Se houver empate, o que tem documento/representante populado.
--   Arquivar os outros (soft-delete via archived_at).
--
-- Reversível: UPDATE archived_at = NULL nos mesmos IDs.
-- ============================================================================

BEGIN;

UPDATE card_financial_items
SET archived_at = NOW(),
    archived_reason = 'duplicado_resync_monde_pre_20260505'
WHERE id IN (
  '564570e2-4257-4ce8-ad9a-5e52ff95ffae',
  '948ca93b-ceb0-43c3-8880-816869ac2b63',
  '6e00b020-6b91-41a5-b285-be8ca17456b3',
  '28141fbe-0244-4747-8f91-1ecdebc69371',
  'd5b1d3ee-debb-4744-9fe4-24b7971ba3ff',
  '0615b494-19f7-4a8b-93f7-c8ca8f2c54c6',
  'f9b56ad6-dd90-454a-ad1f-e2c82f8dbee1',
  '7e0e578c-a045-4a36-9ebf-762b51a882e4',
  '795c148c-41ad-455a-8d64-bb0093c8ecc2',
  '614a5e33-6dfa-4229-955f-5d1613e25d7d',
  'c97755ac-b054-4190-b194-82b6273efadd',
  'ad2947b0-a376-4e6d-860d-83741288a5ce',
  'e199c75d-58bb-4e51-9dc3-7a624bc25538',
  '59cb1c88-5693-4475-b175-3083300cd64f',
  'b1795bdb-c477-47a3-a21d-b6fa5c716b73',
  '5c515817-94b0-4f1c-bcad-796ad342f647',
  '9a5b6fac-7894-4a4c-bba2-68bf9afdcd4a',
  '13d656d0-99ba-4b1e-8ff5-db6053f69ba5',
  'eda3d078-e131-4bcb-ae22-e3b814f824a2',
  '4a658630-20c6-4f33-91f9-75406dd47e2f',
  '574b816f-6198-4646-928c-732c79b257bc',
  '08dc7f0b-7e61-4c6b-8fa2-3f92c7dab467',
  'd4be3234-867d-4361-a109-d281e716684a',
  'aa531a9d-7944-42ec-a621-f96faf7a915a',
  'a1c9d126-a97d-4fdf-a996-911c3e4214a1',
  '570d96d4-439e-4309-8f33-a6697b263481',
  'e3478a0d-70b0-4b2e-b97a-fcd41fb19ecf',
  '7897cc34-db2f-4eb4-80c2-e4382de2ca9a',
  'd9e8d894-6218-468a-86ea-5a13b4d9d9a6',
  'eac509c9-cbd3-4205-b2a7-6f6e025126f5',
  'fd29e1cb-97c9-441a-a523-b512f08daf9f',
  'b83464ea-cd4e-442d-b1f2-465778d26d14',
  'c1fa8196-7a7e-4e64-8c17-68d1a24c6f07',
  'db0fa7eb-f536-457d-8007-34fab93f9cd6',
  '8dccf155-b1c2-41c4-a3ec-31404fda2a9a',
  'ec6ea4e3-78aa-45d5-aa6d-1ad19a352845',
  '875a8425-76f9-46c9-bdd9-804083f1725e',
  '5402a36e-da62-41e0-a771-f4d633689f73',
  '91439ca0-ba74-4154-bcca-4933df275658',
  '1dbb661a-208a-4212-9433-00afaa1ce575',
  '54549440-1e5c-4d19-8043-effe2c25c3cd',
  'f2cfe49f-42de-4ff7-9a7c-d199b590cd0e',
  '3da8734f-e5e0-4f7c-a506-1a032157307f',
  '7e8fac43-e003-4ac2-ada8-a5a1adaf84fa',
  '031ad99a-9f5f-4edd-8207-eabd99b439e2',
  'fcf6f098-5e74-4b73-871e-0d64e8cd6bc2',
  'c3d97b0d-b9cb-4497-93e7-26fe91b77528',
  'cb99c816-f101-4a32-b3d9-2de9281919cf',
  '86abfade-2fa2-44c9-9e6e-d8ec32aeef21',
  '6f59cc54-cd1c-488e-b52c-2de2030d9982',
  '360b9782-5b1e-4020-900d-374014d6f458',
  '83833c2a-d8cd-4d1c-a931-a457b096b457',
  'b89f57d7-4d86-4bc2-85cd-9694b2911ce1',
  'a9b4d043-e72e-4569-a3fd-2518d78475e5',
  '84101dc7-d495-441d-9ba2-463e50f55bf6',
  '8438bee7-4c0a-45fd-94cd-29e2cfcb6695',
  'dd39070c-c9ee-49b5-b3a1-a19208a4cb97',
  'ae29cd56-ac43-4ede-b091-ed11eb188934',
  '438c2a3d-46f3-4b0c-84f0-34b444693f7f',
  'ba9fdd2c-c8e9-4527-a0d1-4d7dfef586cc',
  'f63da3f9-fdf0-4eb9-819e-64b7eba71ee9',
  'faedabaa-b8ba-4ebe-8c01-70ad0fc28f14',
  '9037bc1f-1ce1-4ff7-ab73-c981d20ca7bc',
  '3476d9f0-1520-44be-aa6a-f6dee19c95a6',
  '319c0318-5680-4f04-8d5c-e0ab24be0dc3',
  '4210d9dc-7a96-4497-8744-267d76f661b7',
  'ef4ef63b-9d6c-4119-8585-42fb987ad25f',
  'c01f3cd3-6bf9-4777-8966-93644fb58c10',
  '1b473dac-6855-4a7e-b524-98f8a3d86a4e',
  '561ddf22-8a80-4949-9164-cf3dfc5b61f6',
  'ce52d700-d4ee-488f-9ef7-5b018e59c78c',
  'e9ff7201-d190-4fda-a4a8-fc6fe96d6242',
  '9b233d22-8d7c-451b-8e3f-9bb2b44e3402',
  '335266c3-2c2d-4804-ab12-0400cdf09181',
  'f0d56352-be7f-49c3-8eba-2ce15cd065a6',
  '881bbda2-22a5-4c97-a6b3-061b085ffa34',
  '7842955d-38c3-4c6f-8dce-1d28512cb8d8',
  '95d98b2e-8f55-423f-adc7-5deb0bb668e8',
  '476b2567-843d-4876-b562-d900ce2ee7fc',
  'ca96ff57-3574-47d7-b15c-7f2245744a67',
  '6cde139d-b20d-4ff5-a65f-a6c671dbdb66',
  'fe8273c1-f0e5-41d9-a34e-872941af2151',
  'a7c7605f-9077-4e2b-90fc-6efc54dd6f45',
  '7db35913-8d90-458e-bf3a-ac2a8be178e3',
  '15081d11-afa9-4d5e-a509-0652e78a1947',
  '7e5bc7f4-f0b7-4d03-8d74-2c9e286078a3',
  'efd114c8-e173-4d0a-9212-1cdebd62a527'
)
AND archived_at IS NULL;

-- Recalcula valor_final/receita dos 47 cards afetados
UPDATE cards c
SET
  valor_final = COALESCE((
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
  '089cc9ba-fdd4-40d8-84dd-34421b7866bb',
  '0b6981b3-5787-4d66-aefb-104a460d5971',
  '0cbd96e0-ea55-4917-b228-ab4d1ea243d0',
  '0ecdf551-f0b5-4099-8469-cdee8bc219e0',
  '16a601df-81fa-4c34-85a7-01856e6f4584',
  '21b5555c-7e7a-4ad3-8fc6-c2e9d04ceab0',
  '26520a06-c2b5-4d5d-8ebe-b3e69c2a7dab',
  '29acca5b-fd74-403d-bd69-e3a6171f2522',
  '36a70694-092a-4bce-88fe-ae728a40a464',
  '3ac93776-b485-46b8-8e8e-b0966ed11f3d',
  '5401f6d4-62bf-4251-a690-bc5eb0043362',
  '57dfd2db-591c-4f1d-b895-2b9fdf16ceb5',
  '5da278cc-b334-4479-a3f9-d69663fab106',
  '601f1d74-bf26-444e-9d48-7ad735d8e9d6',
  '6173931c-0834-48d9-b994-46f6b592a1ab',
  '62e65efc-2212-4f53-bc6b-0a99826459f9',
  '701770d7-61a9-4543-be54-37da1858b5f2',
  '76dd90cf-6776-49c9-a128-a67a4488f9ff',
  '7ba9ffc5-3f0d-4da0-9088-a52981c8bfe2',
  '7e0f49ca-de39-4e3d-add7-4a4e8dd68292',
  '8e3a12c6-5898-48c3-b316-81ae2392a27a',
  '90030def-857d-4db4-a319-e6b82774f9fc',
  '95a689a8-1239-4700-884d-56d462820afe',
  '960fdc90-0d29-479f-a4d8-bc91f509856a',
  'a9ac3658-510a-4978-82d2-15687e16a79a',
  'ad7a9a61-a87f-485c-afd6-1160ad5646d9',
  'b3e2dfa8-6f29-46c2-80bd-7d43bb3b914b',
  'b4233ade-3d96-45b7-b80d-9e2a415af4d2',
  'b4a80822-096d-47ca-8a3d-7dcc7c2a52ef',
  'b70d31d1-5b39-440a-8a34-a899696ce31c',
  'b76355e9-f80a-4668-9a9d-a40bc6453cd9',
  'be825e87-eabc-4f2a-9677-b74887326c1b',
  'c5ce3a99-8745-41b7-962c-548ebc67122e',
  'c97fb8fd-c4d7-4c4e-8dd6-3a2e55dce370',
  'd17cbb9f-2e56-4e8d-b22b-8056c85cc0e7',
  'd4b43579-9781-4271-854c-ea0d571c8aab',
  'd92d063d-dbe1-448c-b72e-bfa5e8d713ae',
  'da322ac0-cb17-4ed6-b679-3e42dd71dc64',
  'dbb8c767-dbe3-4dcd-afa7-5b062e90d2ce',
  'df4e4b2c-8830-4238-a449-fd7584bc5e99',
  'eb057d92-2730-4ad2-a966-402c90875932',
  'efee6d02-44a4-4234-b216-deded25df280',
  'f4a0f1b8-726f-475f-8189-a085f8671e93',
  'fafa0663-0f71-40d5-9308-b7d1bffe2baf',
  'fc728a3f-f5e2-4cd4-b8b7-63bcceeedcc9',
  'fe97e6a5-b898-4020-854a-a38f31b534e6',
  'ffd1deb5-fbaa-4cc5-b068-971be8a86721'
);

COMMIT;
