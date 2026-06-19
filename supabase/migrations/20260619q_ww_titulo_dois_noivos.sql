-- Backfill (one-off): combina os nomes dos DOIS noivos no título dos cards
-- WEDDING abertos — de "DW | Ana" para "DW | Ana & João" (Noivo 1 = contato
-- principal, Noivo 2 = 1º contato adicional/acompanhante do card).
--
-- Segurança: só toca em cards cujo título AINDA está na forma automática
-- "<prefixo> | <nome do Noivo 1>" (corpo == nome reconstruído do principal).
-- Isso evita sobrescrever títulos editados à mão ou já combinados (com " & ").
--
-- Por que desligar o trigger: trg_card_titulo_lock_logic reverte mudança de
-- título feita por service_role. O ajuste é deliberado, então desliga só
-- durante o UPDATE e deixa o título TRAVADO (titulo_locked_at = now()).
--
-- Escopo: org workspace Welcome Weddings, produto WEDDING, aberto, com Noivo 2.

BEGIN;

ALTER TABLE public.cards DISABLE TRIGGER trg_card_titulo_lock_logic;

WITH noivo2 AS (
    -- 1º contato adicional do card (menor ordem) = Noivo 2
    SELECT DISTINCT ON (cc.card_id)
           cc.card_id,
           TRIM(COALESCE(c.nome, '') || ' ' || COALESCE(c.sobrenome, '')) AS nome2
      FROM public.cards_contatos cc
      JOIN public.contatos c ON c.id = cc.contato_id
     ORDER BY cc.card_id, cc.ordem ASC, cc.created_at ASC
)
UPDATE public.cards ca
   SET titulo = TRIM(SPLIT_PART(ca.titulo, '|', 1)) || ' | '
              || TRIM(COALESCE(p.nome, '') || ' ' || COALESCE(p.sobrenome, ''))
              || ' & ' || n.nome2,
       titulo_locked_at = NOW()
  -- UPDATE...FROM: tabelas auxiliares por vírgula; relações vão no WHERE
  -- (o alvo "ca" não pode ser referenciado no ON de um JOIN do FROM).
  FROM public.contatos p, noivo2 n
 WHERE ca.org_id = 'b0000000-0000-0000-0000-000000000002'
   AND ca.produto = 'WEDDING'
   AND ca.deleted_at IS NULL
   AND ca.status_comercial NOT IN ('ganho', 'perdido')
   AND ca.pessoa_principal_id = p.id
   AND n.card_id = ca.id
   AND ca.titulo LIKE '%|%'
   AND n.nome2 <> ''
   -- só título ainda na forma automática "prefixo | NomeDoNoivo1" (evita clobber)
   AND LOWER(TRIM(SUBSTRING(ca.titulo FROM POSITION('|' IN ca.titulo) + 1)))
       = LOWER(TRIM(COALESCE(p.nome, '') || ' ' || COALESCE(p.sobrenome, '')))
   -- Noivo 2 com nome diferente do Noivo 1
   AND LOWER(n.nome2) <> LOWER(TRIM(COALESCE(p.nome, '') || ' ' || COALESCE(p.sobrenome, '')))
   -- pula nome2 que parece "string de casal"/lixo (ex.: "Ana e João", "X & Y"),
   -- pra não gerar título redundante; esses ficam pro ajuste manual da SDR
   AND n.nome2 NOT ILIKE '% e %'
   AND n.nome2 NOT ILIKE '%&%'
   AND n.nome2 NOT ILIKE '%,%'
   AND n.nome2 NOT ILIKE '%/%';

ALTER TABLE public.cards ENABLE TRIGGER trg_card_titulo_lock_logic;

COMMIT;
