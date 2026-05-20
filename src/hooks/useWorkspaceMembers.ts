import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'

export interface WorkspaceMember {
  id: string
  nome: string | null
  email: string | null
}

export function useWorkspaceMembers() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['workspace_members', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return []
      const db = supabase as any // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error } = await db
        .from('org_members')
        .select('user_id, profiles!inner(id, nome, email)')
        .eq('org_id', activeOrgId)
        .order('profiles.nome')

      if (error) throw error

      // Flatten the joined data
      return (data || []).map((row: any) => ({
        id: row.user_id,
        nome: row.profiles?.nome || null,
        email: row.profiles?.email || null,
      })) as WorkspaceMember[]
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}
