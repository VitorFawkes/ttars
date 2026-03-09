-- ============================================================
-- MIGRATION: Sync contatos.telefone ↔ contato_meios
-- Date: 2026-03-09
--
-- Garante consistência bidirecional:
-- 1. Quando contatos.telefone muda → upsert em contato_meios (is_principal=true)
-- 2. Quando contato_meios principal muda → update contatos.telefone
-- ============================================================

-- 1. Trigger: contatos.telefone → contato_meios
CREATE OR REPLACE FUNCTION sync_telefone_to_meios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id UUID;
BEGIN
    -- Só age se telefone mudou
    IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
        IF NEW.telefone IS NOT NULL AND TRIM(NEW.telefone) <> '' THEN
            -- Verifica se já existe registro com esse valor para este contato (qualquer tipo)
            -- Evita duplicar quando o reverse trigger (contato_meios→contatos) causa cascade
            SELECT id INTO v_existing_id
            FROM contato_meios
            WHERE contato_id = NEW.id
              AND valor = NEW.telefone
            LIMIT 1;

            IF v_existing_id IS NULL THEN
                -- Nenhum registro com esse valor: upsert como telefone principal
                INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem)
                VALUES (NEW.id, 'telefone', NEW.telefone, true, 'sync')
                ON CONFLICT (tipo, valor_normalizado) WHERE valor_normalizado IS NOT NULL
                DO UPDATE SET
                    valor = EXCLUDED.valor,
                    is_principal = true,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_telefone_to_meios ON contatos;
CREATE TRIGGER trg_sync_telefone_to_meios
    AFTER UPDATE OF telefone ON contatos
    FOR EACH ROW
    EXECUTE FUNCTION sync_telefone_to_meios();

-- 2. Trigger: contato_meios principal → contatos.telefone
CREATE OR REPLACE FUNCTION sync_meios_to_telefone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Só age quando um meio tipo telefone/whatsapp é marcado como principal
    IF NEW.tipo IN ('telefone', 'whatsapp') AND NEW.is_principal = true THEN
        UPDATE contatos
        SET telefone = NEW.valor
        WHERE id = NEW.contato_id
        AND (telefone IS DISTINCT FROM NEW.valor);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_meios_to_telefone ON contato_meios;
CREATE TRIGGER trg_sync_meios_to_telefone
    AFTER INSERT OR UPDATE OF is_principal ON contato_meios
    FOR EACH ROW
    WHEN (NEW.is_principal = true AND NEW.tipo IN ('telefone', 'whatsapp'))
    EXECUTE FUNCTION sync_meios_to_telefone();
