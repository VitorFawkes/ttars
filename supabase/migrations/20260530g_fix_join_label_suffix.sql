-- Fix: _ww_ac_join_faixa_labels devolvia "Mais de R$80" sem o sufixo " mil".
-- Garante que o label final tenha " mil" no fim quando aplicável.

CREATE OR REPLACE FUNCTION public._ww_ac_join_faixa_labels(p_labels text[])
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_first text := p_labels[1];
    v_last text := p_labels[array_length(p_labels, 1)];
    v_result text;
BEGIN
    IF array_length(p_labels, 1) IS NULL OR array_length(p_labels, 1) = 0 THEN
        RETURN '(sem faixa)';
    END IF;
    IF array_length(p_labels, 1) = 1 THEN
        RETURN v_first;
    END IF;
    IF v_first LIKE 'Até R$%' AND v_last LIKE 'Mais de R$%' THEN
        RETURN 'Todas as faixas';
    ELSIF v_first LIKE 'Até R$%' THEN
        v_result := 'Até R$' || split_part(split_part(v_last, '-', 2), ' ', 1);
    ELSIF v_last LIKE 'Mais de R$%' THEN
        -- Pega o "low" do primeiro range (ex: "R$80-100 mil" → "R$80")
        v_result := 'Mais de ' || split_part(v_first, '-', 1);
    ELSE
        v_result := split_part(v_first, '-', 1) || '-' || split_part(split_part(v_last, '-', 2), ' ', 1);
    END IF;
    -- Garante sufixo " mil"
    IF v_result NOT LIKE '% mil' THEN v_result := v_result || ' mil'; END IF;
    RETURN v_result;
END $$;
