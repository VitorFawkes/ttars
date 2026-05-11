-- Concierge: validações no backend pra rpc_marcar_outcome
-- Garante que outcome='aceito' só vale pra tipo_concierge='oferta'
-- (frontend já bloqueia no Kanban, mas modal não — defesa em profundidade)

CREATE OR REPLACE FUNCTION public.rpc_marcar_outcome(
  p_atendimento_id uuid,
  p_outcome text,
  p_valor_final numeric DEFAULT NULL,
  p_cobrado_de text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tarefa_id UUID;
  v_org_id UUID;
  v_tipo_concierge TEXT;
  v_outcome_atual TEXT;
BEGIN
  SELECT tarefa_id, org_id, tipo_concierge, outcome
    INTO v_tarefa_id, v_org_id, v_tipo_concierge, v_outcome_atual
  FROM atendimentos_concierge
  WHERE id = p_atendimento_id;

  IF v_tarefa_id IS NULL THEN
    RAISE EXCEPTION 'Atendimento % não encontrado', p_atendimento_id;
  END IF;

  IF v_org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Atendimento % pertence a outro workspace', p_atendimento_id;
  END IF;

  -- Validação: outcome 'aceito' só faz sentido pra ofertas comerciais
  IF p_outcome = 'aceito' AND v_tipo_concierge <> 'oferta' THEN
    RAISE EXCEPTION 'Atendimentos do tipo % não podem ser marcados como aceitos. Use feito, recusado ou cancelado.', v_tipo_concierge
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validação: outcome precisa estar no domínio
  IF p_outcome NOT IN ('aceito', 'feito', 'recusado', 'cancelado') THEN
    RAISE EXCEPTION 'Outcome inválido: %', p_outcome
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE atendimentos_concierge
  SET outcome = p_outcome,
      outcome_em = now(),
      outcome_por = auth.uid(),
      valor = COALESCE(p_valor_final, valor),
      cobrado_de = COALESCE(p_cobrado_de, cobrado_de),
      payload = CASE
        WHEN p_observacao IS NOT NULL
          THEN payload || jsonb_build_object('observacao_outcome', p_observacao)
        ELSE payload
      END
  WHERE id = p_atendimento_id;

  UPDATE tarefas
  SET concluida = true,
      concluida_em = now()
  WHERE id = v_tarefa_id;
END;
$function$;
