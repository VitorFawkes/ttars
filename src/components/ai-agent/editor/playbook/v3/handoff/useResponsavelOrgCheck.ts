import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Verifica se um profile é membro de uma org específica via tabela org_members.
 *
 * Resolve o falso alarme do plano original ("Cyntya está em outra org"):
 * `profiles.org_id` aponta pra account-mãe, mas `org_members` é a fonte de
 * verdade pra acesso. Esse hook checa o membership real.
 *
 * Retorna:
 *   - isMember: true se o profile é admin/member da org passada
 *   - isLoading
 *   - hasResult: false enquanto carregando ou sem dados pra checar
 */
export function useResponsavelOrgCheck(
  profileId: string | null | undefined,
  orgId: string | null | undefined,
): {
  isMember: boolean | null
  isLoading: boolean
} {
  const enabled = !!profileId && !!orgId

  const query = useQuery({
    queryKey: ['responsavel-org-check', profileId, orgId],
    enabled,
    queryFn: async () => {
      if (!profileId || !orgId) return false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('org_members')
        .select('id')
        .eq('user_id', profileId)
        .eq('org_id', orgId)
        .limit(1)
      if (error) throw error
      return Array.isArray(data) && data.length > 0
    },
  })

  return {
    isMember: enabled ? (query.data ?? null) : null,
    isLoading: query.isLoading,
  }
}
