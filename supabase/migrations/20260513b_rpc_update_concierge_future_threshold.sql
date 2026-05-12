-- =====================================================================
-- 20260513b: RPC rpc_update_concierge_future_threshold(p_dias INT)
--
-- A policy organizations_platform_admin_update (20260412) só permite que
-- platform admins façam UPDATE em organizations. Como o threshold da aba
-- "Agendados para o futuro" é só ergonomia visual da UI, qualquer membro
-- da org deve poder alterar.
--
-- Esta RPC SECURITY DEFINER valida que o caller é membro da org atual
-- (requesting_org_id()) e atualiza a coluna apenas dessa org.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_update_concierge_future_threshold(p_dias INT)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID := requesting_org_id();
    v_row public.organizations;
BEGIN
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'requesting_org_id() retornou NULL — chamada sem JWT?';
    END IF;

    IF p_dias IS NULL OR p_dias < 1 OR p_dias > 365 THEN
        RAISE EXCEPTION 'p_dias deve estar entre 1 e 365 (recebido: %)', p_dias;
    END IF;

    UPDATE public.organizations
       SET concierge_future_threshold_days = p_dias
     WHERE id = v_org_id
     RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Organização % não encontrada', v_org_id;
    END IF;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_concierge_future_threshold(INT) TO authenticated;

COMMENT ON FUNCTION public.rpc_update_concierge_future_threshold(INT) IS
  'Atualiza organizations.concierge_future_threshold_days da org atual (requesting_org_id). Permite qualquer membro alterar — config é puramente ergonômica (segregação visual da aba "Agendados para o futuro" no kanban concierge).';
