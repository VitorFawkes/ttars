-- Migration: Colunas enriquecidas para contatos
-- Contexto: Dados valiosos do CSV (sexo, datas comerciais, tipo PF/PJ)
--           estavam sendo guardados em observacoes/tags em vez de colunas próprias

-- Sexo (M/F, texto livre para não restringir)
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS sexo text;

-- Tipo de cliente (PF/PJ) — DIFERENTE de tipo_pessoa (adulto/crianca)
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS tipo_cliente text;

-- Datas comerciais históricas (vindas do sistema anterior)
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS primeira_venda_data date;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS ultima_venda_data date;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS ultimo_retorno_data date;

-- Data de cadastro no sistema de origem (preservar histórico)
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS data_cadastro_original timestamptz;
