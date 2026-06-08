-- ============================================================================
-- FUNDIR os baldes de orcamento R$50-80 + R$80-100 -> R$50-100 (Vitor, 2026-06-08).
--
-- Motivo: o formulario do site MUDOU. Antigo = "Entre R$50 e R$100 mil" (1 opcao).
-- Novo = dividiu em "R$50-80" + "R$80-100". Resultado: 3 baldes que se sobrepoem
-- (R$50-100 velho 529 + R$50-80 novo 590 + R$80-100 novo 401). Decisao: unificar
-- tudo em R$50-100 mil -> 1 balde comparavel em qualquer periodo (granularidade
-- 50-80 vs 80-100 e descartada de proposito).
--
-- Aplicado em TODOS os conversores de faixa (declarado strict/nao-strict + os 3 de
-- valor numerico) p/ ficar consistente em TODAS as abas. Funcoes compartilhadas =>
-- conserta funil, qualidade, perfil, entrada x realidade, drill de uma vez.
-- Cada funcao recriada a partir da sua ULTIMA definicao viva (so muda os 2 RETURN
-- da faixa 50-100); demais ramos preservados. Apos: rodar refresh_ww_funil_casal.
-- ============================================================================

-- 1) Declarado STRICT (funil, casal, maioria das abas) — base: 20260526f
CREATE OR REPLACE FUNCTION public._ww2_norm_faixa_strict(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    v := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p_raw, '_', ' ', 'g'), '\s+', ' ', 'g')));
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');
    IF v LIKE '%menos de r$50%' OR v LIKE '%ate r$50%' OR v LIKE '%ate de r$50%' THEN RETURN 'Até R$50 mil'; END IF;
    IF v LIKE '%r$50 e r$80%'  THEN RETURN 'R$50-100 mil'; END IF;  -- fundido
    IF v LIKE '%r$80 e r$100%' THEN RETURN 'R$50-100 mil'; END IF;  -- fundido
    IF v LIKE '%r$50 e r$100%' THEN RETURN 'R$50-100 mil'; END IF;
    IF v LIKE '%r$100 e r$200%' THEN RETURN 'R$100-200 mil'; END IF;
    IF v LIKE '%r$200 e r$500%' THEN RETURN 'R$200-500 mil'; END IF;
    IF v LIKE '%mais de r$500%' OR v LIKE '%acima de r$500%' THEN RETURN '+R$500 mil'; END IF;
    RETURN NULL;
END $$;

-- 2) Declarado NAO-STRICT (drill_down) — base: 20260525e
CREATE OR REPLACE FUNCTION public._ww2_norm_faixa(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    CASE
        WHEN p_raw ILIKE '%menos de r$50%' OR p_raw ILIKE '%até%r$50%' THEN RETURN 'Até R$50 mil';
        WHEN p_raw ILIKE '%r$50%80%'  THEN RETURN 'R$50-100 mil';  -- fundido
        WHEN p_raw ILIKE '%r$80%100%' THEN RETURN 'R$50-100 mil';  -- fundido
        WHEN p_raw ILIKE '%r$50%100%' THEN RETURN 'R$50-100 mil';
        WHEN p_raw ILIKE '%r$100%200%' THEN RETURN 'R$100-200 mil';
        WHEN p_raw ILIKE '%r$200%500%' THEN RETURN 'R$200-500 mil';
        WHEN p_raw ILIKE '%mais de r$500%' OR p_raw ILIKE '%acima%500%' THEN RETURN 'Mais de R$500 mil';
        ELSE RETURN TRIM(REPLACE(p_raw, '_', ' '));
    END CASE;
END $$;

-- 3) Valor numerico -> faixa (realidade) — base: 20260526g
CREATE OR REPLACE FUNCTION public._ww_valor_to_faixa(p_valor NUMERIC) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_valor IS NULL OR p_valor < 5000 THEN RETURN NULL; END IF;
    IF p_valor <  50000 THEN RETURN 'Até R$50 mil'; END IF;
    IF p_valor < 100000 THEN RETURN 'R$50-100 mil'; END IF;  -- fundido (era 50-80 e 80-100)
    IF p_valor < 200000 THEN RETURN 'R$100-200 mil'; END IF;
    IF p_valor < 500000 THEN RETURN 'R$200-500 mil'; END IF;
    RETURN '+R$500 mil';
END $$;

-- 4) Valor AC -> faixa — base: 20260530c
CREATE OR REPLACE FUNCTION public._ww_ac_faixa_from_valor(p_valor numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN RETURN NULL; END IF;
  RETURN CASE
    WHEN p_valor <= 50000  THEN 'Até R$50 mil'
    WHEN p_valor <= 100000 THEN 'R$50-100 mil'  -- fundido
    WHEN p_valor <= 200000 THEN 'R$100-200 mil'
    WHEN p_valor <= 500000 THEN 'R$200-500 mil'
    ELSE 'Mais de R$500 mil'
  END;
END $$;

-- 5) Parse texto de orcamento -> faixa — base: 20260527p
CREATE OR REPLACE FUNCTION public._ww_parse_orcamento_to_faixa(p_raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v NUMERIC := _ww_parse_orcamento_to_brl(p_raw);
BEGIN
    IF v IS NULL THEN RETURN NULL; END IF;
    IF v < 0 THEN RETURN 'Outro'; END IF;          -- moeda estrangeira
    IF v <  50000 THEN RETURN 'Até R$50 mil'; END IF;
    IF v < 100000 THEN RETURN 'R$50-100 mil'; END IF;  -- fundido
    IF v < 200000 THEN RETURN 'R$100-200 mil'; END IF;
    IF v < 500000 THEN RETURN 'R$200-500 mil'; END IF;
    RETURN '+R$500 mil';
END $$;

-- 6) Ordem por valor — base: 20260526g (R$50-100 na pos 2; legados tambem -> 2)
CREATE OR REPLACE FUNCTION public._ww_faixa_ordem(p_faixa TEXT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN CASE p_faixa
        WHEN 'Até R$50 mil'      THEN 1
        WHEN 'R$50-100 mil'      THEN 2
        WHEN 'R$50-80 mil'       THEN 2
        WHEN 'R$80-100 mil'      THEN 2
        WHEN 'R$100-200 mil'     THEN 3
        WHEN 'R$200-500 mil'     THEN 4
        WHEN '+R$500 mil'        THEN 5
        WHEN 'Mais de R$500 mil' THEN 5
        ELSE NULL END;
END $$;
