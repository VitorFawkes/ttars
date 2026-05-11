-- ============================================================================
-- Marco A — Lock de nome + helper de nome fraco
-- Date: 2026-04-20
--
-- Permite que rotinas automáticas (Echo, IA) atualizem contatos.nome apenas
-- quando o nome atual é placeholder (dígitos, vazio, "WhatsApp X") e o operador
-- ainda não travou o campo manualmente.
--
-- A UI de edição manual de contato passa a setar contatos.nome_locked_at =
-- NOW() sempre que o operador altera o nome explicitamente. Rotinas
-- automáticas lêem esse campo antes de sobrescrever.
-- ============================================================================

-- 1) Coluna de lock
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS nome_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN contatos.nome_locked_at IS
'Quando o operador editou o nome manualmente. Updates automáticos (Echo, IA) não sobrescrevem nome enquanto esse campo estiver preenchido.';

CREATE INDEX IF NOT EXISTS idx_contatos_nome_locked_at
    ON contatos (nome_locked_at)
    WHERE nome_locked_at IS NOT NULL;

-- 2) Helper: detecta nome fraco (placeholder, dígitos, prefixo gerado)
CREATE OR REPLACE FUNCTION public.is_weak_contact_name(p_nome TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_nome IS NULL THEN TRUE
        WHEN btrim(p_nome) = '' THEN TRUE
        WHEN length(btrim(p_nome)) < 3 THEN TRUE
        -- Só dígitos, com ou sem formatação de telefone: "554199979212", "+55 11 9...", "(41) 99..."
        WHEN btrim(p_nome) ~ '^\+?[\d\s\-\(\)\.]+$' THEN TRUE
        -- Placeholders gerados pelo sistema
        WHEN btrim(p_nome) ~* '^(whatsapp|contato|unknown|cliente|sem\s*nome)(\s|$)' THEN TRUE
        ELSE FALSE
    END;
$$;

COMMENT ON FUNCTION public.is_weak_contact_name IS
'TRUE se o nome é placeholder (vazio, só dígitos, prefixos gerados). Usado para decidir se atualizações automáticas podem sobrescrever.';

GRANT EXECUTE ON FUNCTION public.is_weak_contact_name(TEXT) TO authenticated, anon, service_role;

-- 3) Smoke test — sanity check dos casos principais
DO $$
BEGIN
    ASSERT public.is_weak_contact_name(NULL), 'null deve ser fraco';
    ASSERT public.is_weak_contact_name(''), 'vazio deve ser fraco';
    ASSERT public.is_weak_contact_name('  '), 'whitespace deve ser fraco';
    ASSERT public.is_weak_contact_name('554199979212'), 'digitos deve ser fraco';
    ASSERT public.is_weak_contact_name('+55 41 9999-7212'), 'telefone formatado deve ser fraco';
    ASSERT public.is_weak_contact_name('WhatsApp 5541'), 'whatsapp prefix deve ser fraco';
    ASSERT public.is_weak_contact_name('Contato 123'), 'contato prefix deve ser fraco';
    ASSERT public.is_weak_contact_name('Sem Nome'), 'sem nome placeholder deve ser fraco';
    ASSERT NOT public.is_weak_contact_name('Ilana Guilgen'), 'nome real nao pode ser fraco';
    ASSERT NOT public.is_weak_contact_name('João'), 'primeiro nome curto mas valido nao pode ser fraco';
    ASSERT NOT public.is_weak_contact_name('Ana Souza'), 'nome completo nao pode ser fraco';
END $$;
