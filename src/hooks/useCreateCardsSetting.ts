import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'

/**
 * Interruptor de criação automática de leads por uma fonte de webhook (por workspace).
 * Guardado em integration_settings(key, produto=null); ausente = desligado.
 * RLS filtra por org_id = requesting_org_id(), então só vem o valor do workspace ativo.
 *
 * Fontes hoje: 'leadster_create_cards' (Leadster) e 'site_create_cards' (formulário do site).
 */
export function useCreateCardsSetting(settingKey: string) {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['create-cards-setting', settingKey, activeOrgId],
    queryFn: async (): Promise<boolean> => {
      if (!activeOrgId) return false
      const { data, error } = await supabase
        .from('integration_settings')
        .select('value')
        .eq('key', settingKey)
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
 * Só admin do workspace consegue gravar (RLS). `sourceLabel` só compõe o toast.
 */
export function useSetCreateCardsSetting(settingKey: string, sourceLabel: string) {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc('set_integration_setting', {
        p_key: settingKey,
        p_value: enabled ? 'true' : 'false',
        p_encrypt: false,
      })
      if (error) throw error
    },
    onSuccess: (_data, enabled) => {
      toast.success(
        enabled
          ? `Criação de leads por ${sourceLabel} ligada`
          : `Criação de leads por ${sourceLabel} desligada`,
      )
      queryClient.invalidateQueries({ queryKey: ['create-cards-setting', settingKey, activeOrgId] })
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  })
}
