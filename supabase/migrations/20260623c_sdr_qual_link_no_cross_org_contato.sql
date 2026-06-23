-- ============================================================================
-- 20260623c_sdr_qual_link_no_cross_org_contato.sql
-- ----------------------------------------------------------------------------
-- FIX (cross-org): cards de WEDDING criados via Active falhavam com
--   "sdr_qualifications: cross-org violation entre contato (account) e pontuacao (workspace)"
-- quando o casal já tinha uma qualificação RASCUNHO da SDR.
--
-- Causa: trg_fn_sdr_qual_link_on_card_insert (AFTER INSERT em cards, 20260512d) liga
-- o rascunho ao card e fazia `contato_id = COALESCE(contato_id, NEW.pessoa_principal_id)`.
-- Como os contatos são COMPARTILHADOS na account (a0..001) e a qualificação vive no
-- workspace (b0..002), setar contato_id pro contato da account viola o guard
-- trg_fn_sdr_qual_validate (que exige contato.org == qualificacao.org).
--
-- Correção: só seta contato_id quando o contato é da MESMA org da qualificação; caso
-- contrário mantém como está (NULL → ancorada ao card, que é o padrão: 49/50 das
-- qualificações WEDDING têm contato_id NULL). O guard fica intacto. Recriado a partir
-- da def viva (20260512d), mudando SÓ o UPDATE. Zero mutação de dados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_sdr_qual_link_on_card_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contato_phone TEXT;
  v_qualification_id UUID;
BEGIN
  IF NEW.produto IS DISTINCT FROM 'WEDDING' THEN RETURN NEW; END IF;
  IF NEW.pessoa_principal_id IS NULL THEN RETURN NEW; END IF;

  SELECT telefone INTO v_contato_phone FROM contatos WHERE id = NEW.pessoa_principal_id;

  SELECT id INTO v_qualification_id
  FROM sdr_qualifications
  WHERE org_id = NEW.org_id
    AND card_id IS NULL
    AND (
      contato_id = NEW.pessoa_principal_id
      OR (v_contato_phone IS NOT NULL AND telefone_normalizado = sdr_normalize_phone(v_contato_phone))
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_qualification_id IS NOT NULL THEN
    UPDATE sdr_qualifications
    SET card_id = NEW.id,
        -- Só seta contato_id se o contato for da MESMA org da qualificação. Contatos
        -- compartilhados (account) ≠ org da qualificação (workspace) → mantém NULL
        -- (ancorada ao card), evitando o cross-org violation do guard.
        contato_id = CASE
          WHEN contato_id IS NOT NULL THEN contato_id
          WHEN (SELECT org_id FROM contatos WHERE id = NEW.pessoa_principal_id) = org_id
            THEN NEW.pessoa_principal_id
          ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = v_qualification_id;
  END IF;

  RETURN NEW;
END;
$function$;
