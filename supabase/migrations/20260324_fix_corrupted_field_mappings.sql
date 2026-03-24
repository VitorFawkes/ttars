-- Fix: Limpar dados corrompidos por bug de backward compat no parseCustomFields
-- O bug usava índices do array AC como field IDs, causando mapeamento cruzado:
--   - array index 145 ("WT Tem Hospedagem contratada") → motivo (deveria ser AC field 145 "Qual o intuito da viagem")
--   - array index 151 ("WTN O que voce esta buscando") → quantidade_viajantes (deveria ser AC field 151 "Quantas pessoas?")
--   - array index 150 ("WT Investimento por Pessoa") → duracao_viagem (deveria ser AC field 150 "Quantos dias de viagem?")
--   - array index 57 ("[WT]Origem da última conversão") → destino_informado_lead (deveria ser AC field 57 "Destino informado pelo lead")

BEGIN;

-- 1. produto_data.motivo: limpar valores que NÃO são propósito de viagem
-- Valores corrompidos são respostas do form WT (Sim/Não/Casal/Apenas eu/Amigos/Família)
UPDATE cards
SET produto_data = produto_data - 'motivo'
WHERE produto_data->>'motivo' IN (
  'Não', 'Sim', 'Casal', 'Apenas eu', 'Amigos', 'Família', 'Familia',
  'Elopement', 'Destination Wedding', ''
);

-- 2. produto_data.quantidade_viajantes: limpar valores que NÃO são numéricos
UPDATE cards
SET produto_data = produto_data - 'quantidade_viajantes'
WHERE produto_data->>'quantidade_viajantes' IS NOT NULL
  AND produto_data->>'quantidade_viajantes' !~ '^\d+$';

-- 3. produto_data.duracao_viagem: limpar valores que NÃO são numéricos
UPDATE cards
SET produto_data = produto_data - 'duracao_viagem'
WHERE produto_data->>'duracao_viagem' IS NOT NULL
  AND produto_data->>'duracao_viagem' !~ '^\d+$';

-- 4. produto_data.destino_roteiro: limpar valores que são respostas de form WT
UPDATE cards
SET produto_data = produto_data - 'destino_roteiro'
WHERE produto_data->>'destino_roteiro' IN (
  'Casal', 'Apenas eu', 'Amigos', 'Família', 'Familia', 'Não', 'Sim', ''
);

-- 5. briefing_inicial.destino_informado_lead: limpar valores que são utm_source (não destinos)
UPDATE cards
SET briefing_inicial = briefing_inicial - 'destino_informado_lead'
WHERE briefing_inicial->>'destino_informado_lead' IN (
  'google', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin',
  'organic', 'direct', 'email', 'referral', 'cpc', 'social', ''
);

-- 6. produto_data.cidade_origem: limpar se tem valores de form WT (AC index 143 = "Teste - Motivo de Perda")
UPDATE cards
SET produto_data = produto_data - 'cidade_origem'
WHERE produto_data->>'cidade_origem' IN (
  'Não', 'Sim', '', 'Casal', 'Apenas eu', 'Amigos'
);

COMMIT;
