import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'

const SETTING_KEY = 'leadster_create_cards'

/**
 * Lê o interruptor de criação automática de leads pelo Leadster (por workspace).
 * Guardado em integration_settings(key='leadster_create_cards'); ausente = desligado.
 * RLS filtra por org_id = requesting_org_id(), então só vem o valor do workspace ativo.
 */
export function useLeadsterCreateCards() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['leadster-create-cards', activeOrgId],
    queryFn: async (): Promise<boolean> => {
      if (!activeOrgId) return false
      const { data, error } = await supabase
        .from('integration_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .eq('org_id', activeOrgId)
        .is('produto', null)
        .maybeSingle()
      if (error) throw error
      return (data?.value ?? 'false').toLowerCase() === 'true'
    },
    enabled: !!activeOrgId,
  })
}

/**
 * Liga/desliga o interruptor. Usa a RPC set_integration_setting (SECURITY DEFINER),
 * que resolve org_id via requesting_org_id() e trata a unique composta corretamente.
 * Só admin do workspace consegue gravar (RLS).
 */
export function useSetLeadsterCreateCards() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc('set_integration_setting', {
        p_key: SETTING_KEY,
        p_value: enabled ? 'true' : 'false',
        p_encrypt: false,
      })
      if (error) throw error
    },
    onSuccess: (_data, enabled) => {
      toast.success(enabled ? 'Criação de leads pelo Leadster ligada' : 'Criação de leads pelo Leadster desligada')
      queryClient.invalidateQueries({ queryKey: ['leadster-create-cards', activeOrgId] })
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  })
}
