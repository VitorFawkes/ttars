-- ============================================================================
-- FIX: sync_telefone_to_meios trigger nao populava org_id
-- ============================================================================
-- Quando contatos.telefone era atualizado, o trigger AFTER UPDATE
-- sync_telefone_to_meios fazia INSERT em contato_meios sem passar org_id.
-- A coluna foi marcada NOT NULL no H3 multi-tenant, mas o trigger nao foi
-- atualizado — UPDATEs em contatos quebravam com "null value in column
-- org_id".
--
-- Causa raiz percebida no caso: o contato McQueen criado via AC tinha
-- telefone=null (separadamente: bug do payload bracket no integration-process,
-- ja corrigido). Tentar adicionar o telefone manualmente disparava o trigger
-- e a falha NOT NULL.
--
-- Fix: passar NEW.org_id explicito + idempotente (se contato_meios tem row
-- pra outro contato com mesmo (tipo, valor_normalizado), pula em vez de
-- estourar a unique).
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_telefone_to_meios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id UUID;
    v_global_collision_id UUID;
BEGIN
    IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
        IF NEW.telefone IS NOT NULL AND TRIM(NEW.telefone) <> '' THEN
            -- 1) Ja tem row pra esse contato+valor? Nao reinsere.
            SELECT id INTO v_existing_id
            FROM contato_meios
            WHERE contato_id = NEW.id
              AND valor = NEW.telefone
            LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                RETURN NEW;
            END IF;

            -- 2) Ja existe row pra OUTRO contato com mesmo (tipo, valor_normalizado)?
            -- A unique index e global. Nao podemos inserir — pula.
            -- (Caso comum: dois contatos cadastrados com o mesmo telefone,
            -- ex: McQueen + Arroba Gabardo. UI ainda permite, mas
            -- contato_meios mantem so um registro.)
            SELECT id INTO v_global_collision_id
            FROM contato_meios
            WHERE tipo = 'telefone'
              AND valor_normalizado = regexp_replace(NEW.telefone, '\D', '', 'g')
              AND contato_id IS DISTINCT FROM NEW.id
            LIMIT 1;

            IF v_global_collision_id IS NOT NULL THEN
                RETURN NEW;
            END IF;

            -- 3) Insere com org_id do contato (que e NOT NULL na tabela contatos)
            INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem, org_id)
            VALUES (NEW.id, 'telefone', NEW.telefone, true, 'sync', NEW.org_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_telefone_to_meios() IS
'AFTER UPDATE em contatos.telefone: copia o valor pra contato_meios usando NEW.org_id. Pula se ja existe row pro contato (idempotente) OU se ja existe row global com mesmo (tipo, valor_normalizado) pra outro contato (unique constraint global — UI permite duplicatas mas o meio fica num so).';
