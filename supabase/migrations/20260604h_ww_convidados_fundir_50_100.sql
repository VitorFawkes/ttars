-- ============================================================================
-- CONVIDADOS: corrige bug + funde 50-80/80-100 -> 50-100 (Vitor delegou, 2026-06-08).
--
-- BUG achado: o form mudou (igual a faixa). Antigo "Entre 50 e 100 pessoas" (104
-- casais) estava sendo MISCLASSIFICADO silenciosamente em '50-80' (errado: podem
-- ter ate 100). Decisao: fundir 50-80 + 80-100 + "50 e 100" -> '50-100' (1 balde
-- correto e comparavel). MANTEM 'Até 20' separado (intimo/micro != pequeno, e
-- segmento real de produto). Os "Menos de 50" antigos seguem em '20-50' (no form
-- antigo nao existia 'Até 20'; quem queria pequeno marcava "Menos de 50").
--
-- Buckets finais: Apenas o casal · Até 20 · 20-50 · 50-100 · +100.
-- Aplicado nos 2 normalizadores (strict + nao-strict) + a ordem. Apos: refresh.
-- ============================================================================

-- 1) Strict (funil, casal, maioria das abas) — base: 20260526f
CREATE OR REPLACE FUNCTION public._ww2_norm_conv_strict(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    v := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p_raw, '_', ' ', 'g'), '\s+', ' ', 'g')));
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');
    IF v LIKE '%apenas%casal%' OR v LIKE '%so o casal%' THEN RETURN 'Apenas o casal'; END IF;
    IF v LIKE '%ate 20%' THEN RETURN 'Até 20'; END IF;
    IF v LIKE '%20 a 50%' OR v LIKE '%menos de 50%' OR v LIKE '%ate de 50%' THEN RETURN '20-50'; END IF;
    IF v LIKE '%50 a 80%'  THEN RETURN '50-100'; END IF;  -- fundido
    IF v LIKE '%50 e 100%' THEN RETURN '50-100'; END IF;  -- fundido (era '50-80' = BUG)
    IF v LIKE '%80 a 100%' OR v LIKE '%80 e 100%' THEN RETURN '50-100'; END IF;  -- fundido
    IF v LIKE '%acima de 100%' OR v LIKE '%mais de 100%' OR v LIKE '%+100%' THEN RETURN '+100'; END IF;
    RETURN NULL;
END $$;

-- 2) Nao-strict (drill_down) — base: 20260525e
CREATE OR REPLACE FUNCTION public._ww2_norm_convidados(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    CASE
        WHEN p_raw ILIKE '%apenas o casal%' OR p_raw ILIKE '%só o casal%' THEN RETURN 'Apenas o casal';
        WHEN p_raw ILIKE '%até 20%' THEN RETURN 'Até 20';
        WHEN p_raw ILIKE '%20 a 50%' OR p_raw ILIKE '%menos de 50%' THEN RETURN '20-50';
        WHEN p_raw ILIKE '%50 a 80%' OR p_raw ILIKE '%50 e 100%' THEN RETURN '50-100';  -- fundido (era 50-80)
        WHEN p_raw ILIKE '%80 a 100%' OR p_raw ILIKE '%80 e 100%' THEN RETURN '50-100';  -- fundido
        WHEN p_raw ILIKE '%acima de 100%' OR p_raw ILIKE '%mais de 100%' OR p_raw ILIKE '%+100%' THEN RETURN '+100';
        ELSE RETURN TRIM(REPLACE(p_raw, '_', ' '));
    END CASE;
END $$;

-- 3) Ordem por valor — base: 20260526g (50-100 na pos 4; legados 50-80/80-100 -> 4)
CREATE OR REPLACE FUNCTION public._ww_conv_ordem(p_conv TEXT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN CASE p_conv
        WHEN 'Apenas o casal' THEN 1
        WHEN 'Até 20'         THEN 2
        WHEN '20-50'          THEN 3
        WHEN '50-100'         THEN 4
        WHEN '50-80'          THEN 4
        WHEN '80-100'         THEN 4
        WHEN '+100'           THEN 5
        ELSE NULL END;
END $$;
