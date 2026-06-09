import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { DisparoSaudeLinha } from './types'

/** Saúde das linhas de WhatsApp do workspace (enviados/respostas hoje + status estimado).
 *  A RPC já filtra por requesting_org_id(); revalida a cada 60s. */
export function useDisparoSaudeLinhas() {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<DisparoSaudeLinha[]>({
    queryKey: ['disparo', 'saude-linhas', orgId],
    enabled: !!orgId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await sbAny.rpc('disparo_saude_linhas')
      if (error) throw error
      return (data ?? []) as DisparoSaudeLinha[]
    },
  })
}
