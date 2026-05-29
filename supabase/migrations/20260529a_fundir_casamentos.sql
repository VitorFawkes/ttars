-- ============================================================================
-- MIGRATION: fundir_casamentos — unir casamentos duplicados (Convidados)
-- Date: 2026-05-29
--
-- Funde N casamentos (cards produto=WEDDING) num só, do ponto de vista da aba
-- Convidados. Combina as listas de convidados e DEDUPLICA por telefone:
-- quem aparece repetido (mesmo contato OU mesmo telefone normalizado) vira um
-- só, mantendo o melhor status de RSVP, preenchendo observações vazias e
-- preservando os extras. No fim, delega para fundir_cards_v2 o lado "card"
-- (financeiro, tarefas, atividades) e o arquivamento das origens.
--
-- POR QUE NÃO BASTA fundir_cards_v2 SOZINHO:
--   fundir_cards_v2 NÃO toca em nenhuma tabela wedding_*. Como ele apenas
--   ARQUIVA (archived_at) as origens — não dá DELETE — o ON DELETE CASCADE de
--   wedding_guests.card_id não dispara, e os convidados da origem ficariam
--   órfãos num card arquivado, sumindo do board. Por isso migramos os
--   convidados ANTES de delegar.
--
-- GOTCHA DE TRIGGER:
--   wedding_casais tem trigger AFTER UPDATE OF card_id que propaga o card_id
--   novo para wedding_convites E wedding_guests do casal (UPDATE cego). Esse
--   UPDATE cego poderia violar o índice UNIQUE(card_id, contato_id) e abortar
--   a fusão inteira. Por isso resolvemos os convidados INDIVIDUALMENTE primeiro
--   (merge-ou-reassign, que trata a colisão de contato), e só DEPOIS movemos o
--   casal — momento em que o UPDATE do trigger vira no-op (convidados já estão
--   no destino).
-- ============================================================================

BEGIN;

-- Ranking de RSVP: do "melhor" (confirmado) ao "pior" (nao_vai). Usado para
-- decidir qual status mantém quando dois convidados são mesclados.
CREATE OR REPLACE FUNCTION wedding_rsvp_rank(p_status TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'confirmado'  THEN 4
    WHEN 'intencao'    THEN 3
    WHEN 'sem_reacao'  THEN 2
    WHEN 'nao_vai'     THEN 1
    ELSE 0
  END
$$;

COMMENT ON FUNCTION wedding_rsvp_rank IS
  'Ordena status_rsvp de wedding_guests do melhor (confirmado=4) ao pior (nao_vai=1).';

DROP FUNCTION IF EXISTS fundir_casamentos(UUID[], UUID, TEXT);

CREATE OR REPLACE FUNCTION fundir_casamentos(
  p_origens UUID[],
  p_destino UUID,
  p_motivo  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id           UUID;
  v_destino_org      UUID;
  v_destino_produto  TEXT;
  v_destino_titulo   TEXT;
  v_origem           UUID;
  v_origem_org       UUID;
  v_origem_produto   TEXT;
  v_guests_movidos   INTEGER := 0;
  v_guests_mesclados INTEGER := 0;
  v_origens_processadas INTEGER := 0;
  v_card_result      JSONB;
  r                  RECORD;
  v_winner_id        UUID;
  v_loser_extras     BOOLEAN;
  v_winner_extras    BOOLEAN;
BEGIN
  v_org_id := requesting_org_id();

  -- ── Guards ────────────────────────────────────────────────────────────────
  IF p_destino IS NULL THEN
    RAISE EXCEPTION 'Casamento destino é obrigatório';
  END IF;
  IF p_origens IS NULL OR array_length(p_origens, 1) IS NULL THEN
    RAISE EXCEPTION 'Pelo menos um casamento de origem é obrigatório';
  END IF;
  IF p_destino = ANY(p_origens) THEN
    RAISE EXCEPTION 'O casamento principal não pode estar entre os duplicados';
  END IF;

  SELECT org_id, produto::TEXT, titulo
    INTO v_destino_org, v_destino_produto, v_destino_titulo
  FROM cards WHERE id = p_destino AND deleted_at IS NULL;
  IF v_destino_org IS NULL THEN
    RAISE EXCEPTION 'Casamento principal não encontrado';
  END IF;
  IF v_org_id IS NOT NULL AND v_destino_org <> v_org_id THEN
    RAISE EXCEPTION 'Casamento principal não pertence à sua organização';
  END IF;
  IF v_destino_produto <> 'WEDDING' THEN
    RAISE EXCEPTION 'Card destino não é um casamento (produto=%)', v_destino_produto;
  END IF;

  FOREACH v_origem IN ARRAY p_origens LOOP
    SELECT org_id, produto::TEXT INTO v_origem_org, v_origem_produto
    FROM cards WHERE id = v_origem AND deleted_at IS NULL;
    IF v_origem_org IS NULL THEN
      RAISE EXCEPTION 'Casamento duplicado % não encontrado', v_origem;
    END IF;
    IF v_origem_org <> v_destino_org THEN
      RAISE EXCEPTION 'Casamento duplicado % está em organização diferente do principal', v_origem;
    END IF;
    IF v_origem_produto <> 'WEDDING' THEN
      RAISE EXCEPTION 'Card duplicado % não é um casamento (produto=%)', v_origem, v_origem_produto;
    END IF;

    -- ── 1) Resolver convidados INDIVIDUALMENTE (dedup por contato/telefone) ──
    -- Varre todos os convidados ainda na origem (casal-linked + manuais). Cada
    -- iteração consulta o destino, então dois convidados da mesma origem com o
    -- mesmo telefone já colapsam entre si (o segundo encontra o primeiro,
    -- recém-movido, como vencedor) — idempotente dentro do loop.
    FOR r IN
      SELECT g.id,
             g.contato_id,
             g.status_rsvp,
             g.observacoes,
             sdr_normalize_phone(COALESCE(c.telefone, g.telefone_raw)) AS normphone
      FROM wedding_guests g
      LEFT JOIN contatos c ON c.id = g.contato_id
      WHERE g.card_id = v_origem
    LOOP
      -- Vencedor já no destino: mesmo contato OU mesmo telefone normalizado.
      SELECT g2.id INTO v_winner_id
      FROM wedding_guests g2
      LEFT JOIN contatos c2 ON c2.id = g2.contato_id
      WHERE g2.card_id = p_destino
        AND (
          (r.contato_id IS NOT NULL AND g2.contato_id = r.contato_id)
          OR (r.normphone IS NOT NULL
              AND sdr_normalize_phone(COALESCE(c2.telefone, g2.telefone_raw)) = r.normphone)
        )
      LIMIT 1;

      IF v_winner_id IS NOT NULL THEN
        -- DUPLICADO: mescla no vencedor e apaga o perdedor.
        UPDATE wedding_guests w
           SET status_rsvp = CASE
                 WHEN wedding_rsvp_rank(r.status_rsvp) > wedding_rsvp_rank(w.status_rsvp)
                 THEN r.status_rsvp ELSE w.status_rsvp END,
               observacoes = COALESCE(NULLIF(TRIM(w.observacoes), ''), r.observacoes)
         WHERE w.id = v_winner_id;

        SELECT EXISTS(SELECT 1 FROM wedding_guest_extras WHERE guest_id = r.id)
          INTO v_loser_extras;
        SELECT EXISTS(SELECT 1 FROM wedding_guest_extras WHERE guest_id = v_winner_id)
          INTO v_winner_extras;
        -- Move os extras do perdedor só se o vencedor ainda não tem (UNIQUE guest_id).
        IF v_loser_extras AND NOT v_winner_extras THEN
          UPDATE wedding_guest_extras
             SET guest_id = v_winner_id, card_id = p_destino
           WHERE guest_id = r.id;
        END IF;

        DELETE FROM wedding_guests WHERE id = r.id;  -- extras restantes caem por cascade
        v_guests_mesclados := v_guests_mesclados + 1;
      ELSE
        -- NÃO DUPLICADO: realoca para o destino. Sem risco no UNIQUE
        -- (card_id, contato_id) porque a colisão de contato já caiu no ramo acima.
        UPDATE wedding_guests SET card_id = p_destino WHERE id = r.id;
        UPDATE wedding_guest_extras SET card_id = p_destino WHERE guest_id = r.id;
        v_guests_movidos := v_guests_movidos + 1;
      END IF;
    END LOOP;

    -- ── 2) Mover casais + convites para o destino ───────────────────────────
    -- Os convidados do casal já foram resolvidos no passo 1, então o UPDATE
    -- cego do trigger de wedding_casais vira no-op (não viola o UNIQUE).
    UPDATE wedding_casais   SET card_id = p_destino WHERE card_id = v_origem;
    UPDATE wedding_convites SET card_id = p_destino WHERE card_id = v_origem;

    -- ── 3) Estado da etapa de convidados ────────────────────────────────────
    IF EXISTS (SELECT 1 FROM wedding_convidados_state WHERE card_id = p_destino) THEN
      DELETE FROM wedding_convidados_state WHERE card_id = v_origem;
    ELSE
      UPDATE wedding_convidados_state SET card_id = p_destino WHERE card_id = v_origem;
    END IF;

    v_origens_processadas := v_origens_processadas + 1;
  END LOOP;

  -- ── 4) Delegar o lado "card" (financeiro/tarefas/atividades + arquivar) ────
  v_card_result := fundir_cards_v2(p_origens, p_destino, TRUE, TRUE, NULL, NULL, p_motivo);

  RETURN jsonb_build_object(
    'success', true,
    'card_destino_id', p_destino,
    'card_destino_titulo', v_destino_titulo,
    'origens_processadas', v_origens_processadas,
    'guests_movidos', v_guests_movidos,
    'guests_mesclados', v_guests_mesclados,
    'card_merge', v_card_result
  );
END;
$$;

COMMENT ON FUNCTION fundir_casamentos IS
  'Une N casamentos (produto=WEDDING) num só: combina listas de convidados '
  'deduplicando por contato/telefone (melhor RSVP + extras preservados) e '
  'delega a fundir_cards_v2 o lado card + arquivamento das origens.';

GRANT EXECUTE ON FUNCTION wedding_rsvp_rank(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fundir_casamentos(UUID[], UUID, TEXT) TO authenticated;

COMMIT;

-- ── Validação pós-migration ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fundir_casamentos'
  ) THEN
    RAISE EXCEPTION 'fundir_casamentos: função não foi criada';
  END IF;
  RAISE NOTICE 'fundir_casamentos: OK';
END $$;
