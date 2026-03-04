-- Fix card values corrupted by AC integration value conversion bugs
-- Bug 1: integration-process divided webhook value_raw by 100 (already in reais)
-- Bug 2: integration-sync-deals passed AC API cents directly (no /100 conversion)
-- Total cards to fix: 136
-- Source of truth: ActiveCampaign API deal values (verified correct)

BEGIN;

-- Emily / Carros / Junho 2026 (was 50, AC=R$5,000.00)
UPDATE cards SET
  valor_estimado = 5000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 5000.0, 'total_calculado', 5000.0, 'display', 'R$ 5.000')
  )
WHERE id = 'fbe82bd0-a42d-4608-9a53-fd35ed6c22ff';

-- Bione / Orlando / Abril (was 35, AC=R$3,500.00)
UPDATE cards SET
  valor_estimado = 3500.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 3500.0, 'total_calculado', 3500.0, 'display', 'R$ 3.500')
  )
WHERE id = 'ec6ffdb4-5f9e-487a-9d53-89c37c5c2e4f';

-- Marcella e Heitor /Africa do Sul / Dezembro (was 500, AC=R$50,000.00)
UPDATE cards SET
  valor_estimado = 50000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 50000.0, 'total_calculado', 50000.0, 'display', 'R$ 50.000')
  )
WHERE id = '86b4f484-bb51-49f7-83a6-37f1b62d20ab';

-- Emily / Croacia / Julho (was 150, AC=R$15,000.00)
UPDATE cards SET
  valor_estimado = 15000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 15000.0, 'total_calculado', 15000.0, 'display', 'R$ 15.000')
  )
WHERE id = '2c3783c5-a754-4cd2-83dc-3f19913efa00';

-- EXEMPLO (was 10000, AC=R$100.00)
UPDATE cards SET
  valor_estimado = 100.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 100.0, 'total_calculado', 100.0, 'display', 'R$ 100,00')
  )
WHERE id = 'a3439f9a-76ae-4fae-bbab-c95fbab5dccb';

-- Andreia Faria Fiaux / Imersão | Reggio Emilia / Ja (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e098cd14-6971-4f15-84bc-6fe0c320e70c';

-- Imersão | Reggio Emilia - Evelyn (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e98bad25-e155-410f-ae19-f3f18885dfb6';

-- Imersão | Reggio Emilia - Natalia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e620f914-3419-49bc-9d84-a9b8f4c6fffa';

-- Imersão | Reggio Emilia - Daesy (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ad421d70-b438-49b0-b179-61f062ff5e4e';

-- Imersão | Reggio Emilia - Daniela Bitencourt (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'b4872f31-e928-4f52-be95-3e9d9cb03518';

-- Imersão | Reggio Emilia - Marta (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'cdcb8bfa-175d-4019-9a1c-3321d4a53b9b';

-- Imersão | Reggio Emilia - SUELLEN (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '43a2f2e0-225e-46d4-8a72-4de3489f2b1d';

-- Imersão | Reggio Emilia - Jacqueline (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '08f69263-2afb-4d5d-ae1f-5bb63dec123c';

-- Imersão | Reggio Emilia - Bruna (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '74e46739-bf42-4c4f-8124-1bb55517a7b8';

-- Imersão | Reggio Emilia - Eloize (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'c29b10df-4d96-4925-850a-983f3e5f2946';

-- Imersão | Reggio Emilia - Silvana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '173e343e-10c5-45c2-bd4b-f8935b96ce54';

-- Imersão | Reggio Emilia - Carita (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '236f644f-f150-484a-a962-7773685388ca';

-- Imersão | Reggio Emilia - Kênia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '2cf7836f-bb9e-4df1-bb07-15b490e364b7';

-- Imersão | Reggio Emilia - Glaylson (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '7e05ad6c-4cc5-4217-bddd-d4563fb0b858';

-- Imersão | Reggio Emilia - Gislaine (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '1911d004-291f-4ab4-8d2a-29fe2f833395';

-- Imersão | Reggio Emilia - Claudia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'baa2a45c-a86d-43ee-8d6e-7d7b20429776';

-- Imersão | Reggio Emilia - Audenize (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '4a357f22-d6d1-49cb-8ace-78663e8828d8';

-- Imersão | Reggio Emilia - Melissa (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e0ba15d8-a10b-4dba-abf1-b4da483f781b';

-- Imersão | Reggio Emilia - Isabela (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '49389edd-38f8-4067-a266-7496cef736fd';

-- Imersão | Reggio Emilia - Isadora (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'c8425d8b-9341-4c19-8191-e750198d15f2';

-- Imersão | Reggio Emilia - Maria Eduarda (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ff4a30ae-3cb5-4755-a513-e8715c2a7753';

-- Imersão | Reggio Emilia - Katia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '3372700a-4f10-427b-8f23-136cdad4c733';

-- Imersão | Reggio Emilia - Nathália (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '11a0c7b0-8e44-4d51-8a0a-b356d60ab653';

-- Imersão | Reggio Emilia - Isabelle (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '7ac95375-b8b2-4e90-ba43-211ef2fab2b5';

-- Imersão | Reggio Emilia - Fernanda (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '42854c88-9284-43e2-bb3b-c3b48546e7cf';

-- Imersão | Reggio Emilia - Deborah (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'b18eb3d9-3cf4-4d5c-837b-e60a1ccacd6e';

-- Imersão | Reggio Emilia - Jennefer (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ae2dad47-c281-4060-a5c0-604b3d989b9d';

-- Imersão | Reggio Emilia - Juliana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '77141f91-adb9-430c-adfa-d972bca1cd41';

-- Imersão | Reggio Emilia - Leila (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '751c5b19-1f8c-4b3d-b7e0-cec88786b3bc';

-- Imersão | Reggio Emilia - Beatriz (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '0f63444d-a81f-4972-be73-ea5ec3bda17d';

-- Illana/Europa/ Maio de 2026 (was 300, AC=R$30,000.00)
UPDATE cards SET
  valor_estimado = 30000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 30000.0, 'total_calculado', 30000.0, 'display', 'R$ 30.000')
  )
WHERE id = 'af2fd85c-ffaa-495b-9884-e28809d38138';

-- Imersão | Reggio Emilia - Rita (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '96a9a8e3-8397-4411-99b4-adce20725367';

-- Imersão | Reggio Emilia - Talia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'a7443bf9-d1a6-477c-bec7-6a8c011ddf43';

-- Imersão | Reggio Emilia - Heloisa (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'b3b73807-ed1c-46b5-b0c0-1c68f1c4c51b';

-- Imersão | Reggio Emilia - Marcelo (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '9cdc6c51-9d04-40cc-8c43-942cb6b5f5c3';

-- Imersão | Reggio Emilia - Natali (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '326dc1e2-5849-495b-a227-eb71f68e4e69';

-- Imersão | Reggio Emilia - Fabiana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '919d9310-dc03-4e6c-bd95-e35460e20053';

-- Imersão | Reggio Emilia - Dayane (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'd2e55a1d-353a-4b10-a6be-334538300f80';

-- Imersão | Reggio Emilia - Nathalia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'a12aeba4-05de-40c3-95e6-f26bc06be5a7';

-- Imersão | Reggio Emilia - Liciane (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'd8dc487b-9bba-45aa-aa2f-8065fc9f3c8e';

-- Imersão | Reggio Emilia - Anna Patrícia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'df6f2462-c0fc-45af-83db-11309da1dd4e';

-- Cláudia (was 20000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '81c37475-cac9-4aec-bc74-e9e3ae042184';

-- Imersão | Reggio Emilia - Maria Luiza (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '36e491a6-0d51-43c4-8936-53c105824b8c';

-- Julia e André / Lua de mel / Setembro (was 50, AC=R$50,000.00)
UPDATE cards SET
  valor_estimado = 50000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 50000.0, 'total_calculado', 50000.0, 'display', 'R$ 50.000')
  )
WHERE id = 'ec234709-2cff-4bcc-8701-40b38071ca9a';

-- Carolini / Itália / Maio 2026 (was 665.8407000000001, AC=R$66,584.07)
UPDATE cards SET
  valor_estimado = 66584.07,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 66584.07, 'total_calculado', 66584.07, 'display', 'R$ 66.584')
  )
WHERE id = '90b09368-0d40-4abd-b958-a2d3b6cbc309';

-- Imersão | Reggio Emilia - talita (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '34c55b20-5446-4ae9-bd49-e3162f4275d6';

-- Rubia/ Serviços Tailandia/Mar26 (was 400, AC=R$40,000.00)
UPDATE cards SET
  valor_estimado = 40000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 40000.0, 'total_calculado', 40000.0, 'display', 'R$ 40.000')
  )
WHERE id = 'd57a6c87-79b2-4766-94e1-0e412f5c00de';

-- CRM TESTE 7 (was 10000, AC=R$100.00)
UPDATE cards SET
  valor_estimado = 100.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 100.0, 'total_calculado', 100.0, 'display', 'R$ 100,00')
  )
WHERE id = 'bb7450ee-7fd0-45b7-9dd3-8d537c3bbeca';

-- Rodrigo (was 40000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '4db22574-0791-49b8-863f-b294d8ec3596';

-- Jessica e Pedro / Pipa e Natal  / Fevereiro 2026 (was 80, AC=R$8,000.00)
UPDATE cards SET
  valor_estimado = 8000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 8000.0, 'total_calculado', 8000.0, 'display', 'R$ 8.000')
  )
WHERE id = 'aaec1dec-3519-4d49-8f12-b52513a6385b';

-- João/Japao Luca/Março26 (was 8000000, AC=R$80,000.00)
UPDATE cards SET
  valor_estimado = 80000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 80000.0, 'total_calculado', 80000.0, 'display', 'R$ 80.000')
  )
WHERE id = 'ae4a5c4c-b905-42bb-8c3a-c719beb43e4d';

-- Mariana Campos Polesel /Itália / Outubro 2026 (was 220.8278, AC=R$22,082.78)
UPDATE cards SET
  valor_estimado = 22082.78,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 22082.78, 'total_calculado', 22082.78, 'display', 'R$ 22.083')
  )
WHERE id = '55d241bd-0a3b-4a59-b26b-836a65e22783';

-- Vanessa/Mendoza/Março26 (was 4000000, AC=R$40,000.00)
UPDATE cards SET
  valor_estimado = 40000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 40000.0, 'total_calculado', 40000.0, 'display', 'R$ 40.000')
  )
WHERE id = '36a70694-092a-4bce-88fe-ae728a40a464';

-- Imersão | Reggio Emilia - Victoria Jhessyca (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'f6a8f5cc-8204-4a5c-8908-cab20962f26a';

-- Darci/ Foz do Iguaçu/ Abril de 2026 (was 4, AC=R$4,000.00)
UPDATE cards SET
  valor_estimado = 4000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 4000.0, 'total_calculado', 4000.0, 'display', 'R$ 4.000')
  )
WHERE id = '257ac1cb-f91a-409a-bcf6-ff1021f7ccab';

-- Imersão | Reggio Emilia - Tacila (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '040193cb-26e1-461f-aefe-1556d2a42e19';

-- Imersão | Reggio Emilia - Ketlyn (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'aaf9160b-6909-404b-a9b5-390470e4db92';

-- Imersão | Reggio Emilia - Bruna (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '916f4af1-c59d-4be2-98e6-e314d4bd7c10';

-- Imersão | Reggio Emilia - Barbara (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'b3d7a6ad-2486-4b74-97fb-829b675ebce5';

-- Carolina/Turquia/Setembro26 (was 500, AC=R$50,000.00)
UPDATE cards SET
  valor_estimado = 50000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 50000.0, 'total_calculado', 50000.0, 'display', 'R$ 50.000')
  )
WHERE id = '8124c455-799e-4294-8f32-151da3102590';

-- Imersão | Reggio Emilia - Ryan (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '0182842b-4a31-4ae1-b686-27dbd885c29b';

-- Lucia / Italia / Julho (was 300, AC=R$30,000.00)
UPDATE cards SET
  valor_estimado = 30000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 30000.0, 'total_calculado', 30000.0, 'display', 'R$ 30.000')
  )
WHERE id = '49ae2bbf-5c24-4e54-951f-b2d50c38e300';

-- Alessandra/Asia/Setembro26 (was 800, AC=R$80,000.00)
UPDATE cards SET
  valor_estimado = 80000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 80000.0, 'total_calculado', 80000.0, 'display', 'R$ 80.000')
  )
WHERE id = '09b6c1be-5ef0-43e7-b92f-bfcdf99652f7';

-- Yandra e Cíntia /  Passeios / Maio 2026 (was 5, AC=R$5,000.00)
UPDATE cards SET
  valor_estimado = 5000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 5000.0, 'total_calculado', 5000.0, 'display', 'R$ 5.000')
  )
WHERE id = '5dbda08a-86dd-471b-9c8a-ce7d5d0e3bfc';

-- Imersão | Reggio Emilia - KATIA (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ef84c284-adc2-4850-89ec-773cfa262c44';

-- Imersão | Reggio Emilia - Daianny (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '23b2b95e-1c55-4230-90ba-71a7bf189b70';

-- Elias/ Cancun/ Maio de 2026 (was 160, AC=R$16,000.00)
UPDATE cards SET
  valor_estimado = 16000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 16000.0, 'total_calculado', 16000.0, 'display', 'R$ 16.000')
  )
WHERE id = '5b14025d-0180-47b3-83b7-10a13813bd03';

-- Imersão | Reggio Emilia - MARCELA (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '48375663-513d-4b2f-89e8-b0154e4b543a';

-- Giselle/ Escocia/ Maio de 2026 (was 50, AC=R$5,000.00)
UPDATE cards SET
  valor_estimado = 5000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 5000.0, 'total_calculado', 5000.0, 'display', 'R$ 5.000')
  )
WHERE id = '1fc34f4d-0268-42bf-b193-95a89edfa7a4';

-- Ayla/Argentina/Agosto26 (was 500, AC=R$50,000.00)
UPDATE cards SET
  valor_estimado = 50000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 50000.0, 'total_calculado', 50000.0, 'display', 'R$ 50.000')
  )
WHERE id = '97e163d9-b7c1-4536-942e-f3de655e8bc2';

-- João / Amazonia / Fevereiro de 2026 (was 900, AC=R$90,000.00)
UPDATE cards SET
  valor_estimado = 90000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 90000.0, 'total_calculado', 90000.0, 'display', 'R$ 90.000')
  )
WHERE id = '3903ad5e-4391-453b-9eda-671219694499';

-- Isabelle (was 30000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '1e173c38-bc11-4c55-8ff0-c557e966eaee';

-- Dani Porres / Imersão | Reggio Emilia / Janeiro 20 (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '2ca33ad9-dfea-4ab5-bec0-e4a6ca4229d1';

-- Imersão | Reggio Emilia -  Vivian (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '8c8242fa-ecd7-4dd6-9846-c3a9d7d0af18';

-- Imersão | Reggio Emilia - Maria Carolina (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '4ab52f56-53c2-40da-a073-9d7f65fc5b0b';

-- Imersão | Reggio Emilia - Isabella (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e2ca6273-d8be-45d4-89af-75d2e81d1305';

-- Imersão | Reggio Emilia - Caryna (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '841c6ebe-ac11-423d-81c3-79d754bf5c29';

-- Imersão | Reggio Emilia - JESSICA (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '7ae8ee7a-3a5d-440f-9b0e-32c94a729529';

-- Marina / Miami / Fevereiro 2026 (was 37.1631, AC=R$3,716.31)
UPDATE cards SET
  valor_estimado = 3716.31,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 3716.31, 'total_calculado', 3716.31, 'display', 'R$ 3.716')
  )
WHERE id = '3e1efaee-2f43-45f8-acd4-2867e7e1fd65';

-- Imersão | Reggio Emilia - Gabrielle (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '862ca747-9e94-419b-8811-e019a6be6486';

-- Imersão | Reggio Emilia - Francielly (was 30000, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '1146185f-82d7-40cf-b1e5-f74112368b6c';

-- Imersão | Reggio Emilia - Luiza (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '5ada391b-bd4c-4b84-8242-495ea2fef34f';

-- Imersão | Reggio Emilia - Barbara (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '69cf8b81-2648-443f-a670-1b8551d8f302';

-- Imersão | Reggio Emilia - Cínthia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '12b8aafe-6607-4ba9-9c50-14e83c03c06b';

-- Imersão | Reggio Emilia - Luciany (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '1e53e489-6f5f-49ce-ac31-2f6f7aaa2501';

-- Imersão | Reggio Emilia - juarez (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ff5477d7-5197-477a-8014-0374fc980f97';

-- Imersão | Reggio Emilia - Marisa (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'a0828b39-e3fb-46c4-9861-86eb18eb5f0d';

-- Imersão | Reggio Emilia - João Victor (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '8d41ca3d-dd23-48a2-9f67-a0ba21d4836b';

-- Imersão | Reggio Emilia - Ivan (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'efb3d4aa-be20-469f-acf7-5d22cf8bf0d7';

-- Imersão | Reggio Emilia - Camille (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'bfe89bf7-0205-4f3c-a746-d49d9f58779d';

-- Imersão | Reggio Emilia - THALIA (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e26f6da4-de90-480d-a1c7-af8497dbad3d';

-- Imersão | Reggio Emilia - Mariana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'a3483a61-e786-4b6d-922c-dab08b109937';

-- Imersão | Reggio Emilia - Sandra (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'df808ef8-5705-4533-a7e1-892660e41147';

-- Luciana (was 10000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '06acd499-b61f-468e-86fc-cb414d0e0038';

-- Vania / Italia / Setembro (was 120, AC=R$120,000.00)
UPDATE cards SET
  valor_estimado = 120000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 120000.0, 'total_calculado', 120000.0, 'display', 'R$ 120.000')
  )
WHERE id = '9aa4c2a4-8c54-409d-ae29-25ffc0a036d3';

-- Imersão | Reggio Emilia - Sulamita (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '796aafc5-c5cd-4ecf-886c-28dee422f679';

-- Imersão | Reggio Emilia - Iris (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e5c950a1-bf86-44f6-b589-80b03b8202d9';

-- Diete e Sergio/Italia/maio26 (was 50, AC=R$50,000.00)
UPDATE cards SET
  valor_estimado = 50000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 50000.0, 'total_calculado', 50000.0, 'display', 'R$ 50.000')
  )
WHERE id = '3f8f6eb4-27ff-406a-b5be-fb86cd3dd197';

-- Imersão | Reggio Emilia - Juliana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '02f2371f-c29d-46f6-8d2b-387c1237b886';

-- Imersão | Reggio Emilia - Thais (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '069f1d84-76ff-412a-9445-c6af907dd96c';

-- Imersão | Reggio Emilia - Sandra (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'd0902992-2ad3-49cb-9569-b0cc1a0e2b0e';

-- Imersão | Reggio Emilia - Gabriela (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ae573c0d-f001-4489-8dee-53c167463a7f';

-- Imersão | Reggio Emilia - Débora Natine (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e8db4a1b-23ec-4282-9313-2bf042488621';

-- Luciane Guntzel / Orlando / Maio 2026 (was 500, AC=R$50,000.00)
UPDATE cards SET
  valor_estimado = 50000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 50000.0, 'total_calculado', 50000.0, 'display', 'R$ 50.000')
  )
WHERE id = '334d3487-b7e6-4252-aa6d-4458c99e93d2';

-- Imersão | Reggio Emilia - Fernanda (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ad8beef3-4bae-4752-bc8e-bf319b9eab6f';

-- Cyntya/teste card/nov26 (was 90000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '4213f398-fde6-49db-ad86-aa262034731d';

-- Imersão | Reggio Emilia - Maria Eduarda (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'c3b66ff2-ea00-46b8-ad7a-958d321be29a';

-- Imersão | Reggio Emilia - Vitoria (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'f149dbb4-6dc4-4635-b5ec-ab28ad79c9e7';

-- Imersão | Reggio Emilia - Simone (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e019e1a1-0c82-4847-a37e-c1dff09a4666';

-- Imersão | Reggio Emilia - Maria Claudia Souza Alme (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'ba3c3e2d-5675-48b5-864d-7e92e82eb86a';

-- Imersão | Reggio Emilia - Marilia (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'b4129e3d-f09c-46fd-b522-a538089e6fcb';

-- Camila Urio / Tailandia, Bali e Singapura / Novemb (was 380.64599999999996, AC=R$38,064.60)
UPDATE cards SET
  valor_estimado = 38064.6,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 38064.6, 'total_calculado', 38064.6, 'display', 'R$ 38.065')
  )
WHERE id = 'f707a71c-d11a-4fdc-aec1-75013dca9ecf';

-- Yandra e Cíntia /  Lua de mel / Maio 2026 (was 83.64, AC=R$8,364.00)
UPDATE cards SET
  valor_estimado = 8364.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 8364.0, 'total_calculado', 8364.0, 'display', 'R$ 8.364')
  )
WHERE id = 'd17cbb9f-2e56-4e8d-b22b-8056c85cc0e7';

-- Imersão | Reggio Emilia - Giovana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '18fcd812-02d6-4535-8675-e89f56326bbb';

-- Lucia / Italia / Junho (was 16, AC=R$1,600.00)
UPDATE cards SET
  valor_estimado = 1600.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 1600.0, 'total_calculado', 1600.0, 'display', 'R$ 1.600')
  )
WHERE id = '83fea494-3f16-4706-8057-944269be2544';

-- Fernanda / Brusque / Fevereiro (was 50, AC=R$5,000.00)
UPDATE cards SET
  valor_estimado = 5000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 5000.0, 'total_calculado', 5000.0, 'display', 'R$ 5.000')
  )
WHERE id = '346ba02d-6ce0-4357-a9e9-181a6707ddc8';

-- Andreia (was 25000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '6957d0cf-b12b-42d4-af35-c7c1332a26e8';

-- Imersão | Reggio Emilia - Luanny (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '96f00513-8df4-4363-933b-fb99b2c0dcee';

-- Alfredo/ Quenia / Junho de 2026 (was 130, AC=R$130,000.00)
UPDATE cards SET
  valor_estimado = 130000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 130000.0, 'total_calculado', 130000.0, 'display', 'R$ 130.000')
  )
WHERE id = '85d633e2-a0f9-4af0-87cd-b5b8f7263cbb';

-- Thaissa (was 40000, AC=R$0.00)
UPDATE cards SET
  valor_estimado = 0.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 0.0, 'total_calculado', 0.0, 'display', 'R$ 0,00')
  )
WHERE id = '9eeedc8c-c1a4-4163-9e5d-8dbdcc7ac533';

-- Andressa/Mexico/Agosto26 (was 10, AC=R$10,000.00)
UPDATE cards SET
  valor_estimado = 10000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 10000.0, 'total_calculado', 10000.0, 'display', 'R$ 10.000')
  )
WHERE id = '25057b0a-0ede-46f2-982c-394c29f45ef2';

-- Imersão | Reggio Emilia - Gloria (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '7f3c0138-da2c-4a06-a7a1-0b743075e169';

-- Imersão | Reggio Emilia - Luciana (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '702747c0-3aa1-486a-b9d6-6b986055cbc2';

-- Imersão | Reggio Emilia - Sandro (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'e4733484-4995-45dd-ac96-dbff0fd8cb37';

-- Imersão | Reggio Emilia - Eduarda (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '668c51bb-daf7-4594-b169-7b88d6f6b572';

-- Gustavo / Dubai / Março de 2026 (was 200, AC=R$20,000.00)
UPDATE cards SET
  valor_estimado = 20000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 20000.0, 'total_calculado', 20000.0, 'display', 'R$ 20.000')
  )
WHERE id = '4b8e8288-3867-4072-810e-4807eaf28d67';

-- Imersão | Reggio Emilia - MARISTELA (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = 'b0cf1874-6235-466a-8297-e2e55899a16e';

-- Juliana / Chile/ Julho de 2026 (was 15, AC=R$15,000.00)
UPDATE cards SET
  valor_estimado = 15000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 15000.0, 'total_calculado', 15000.0, 'display', 'R$ 15.000')
  )
WHERE id = '5d9c5a44-4374-4b39-b822-0f2f3427a1ab';

-- Imersão | Reggio Emilia - Maria Eloiza (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '3e4edfcc-cb4f-42b7-988c-95624bfd41b3';

-- Rafael / Cancun / Maio de 2026 (was 300, AC=R$30,000.00)
UPDATE cards SET
  valor_estimado = 30000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 30000.0, 'total_calculado', 30000.0, 'display', 'R$ 30.000')
  )
WHERE id = 'd2e8180b-859b-4ef9-b4fb-394382f6abd1';

-- Imersão | Reggio Emilia - Monica (was 28, AC=R$28,000.00)
UPDATE cards SET
  valor_estimado = 28000.0,
  produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object('tipo', 'total', 'valor', 28000.0, 'total_calculado', 28000.0, 'display', 'R$ 28.000')
  )
WHERE id = '9dc4df24-8a0f-45f3-a3f1-8912caa86be0';

COMMIT;