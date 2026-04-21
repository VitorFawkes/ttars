import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface FilterProfile {
  id: string
  nome: string | null
}

export interface FilterDestination {
  id: string
  nome: string
}

export interface FilterTag {
  id: string
  name: string
}

export function useFilterProfiles() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_v2_filter_profiles', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('active', true)
        .eq('org_id', activeOrgId)
        .order('nome')
      if (error) throw error
      return (data || []).map(p => ({ id: p.id, nome: p.nome || '' }))
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}

export function useFilterOrigens() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_v2_filter_origens', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return []
      const { data, error } = await supabase
        .from('cards')
        .select('origem')
        .eq('org_id', activeOrgId)
        .not('origem', 'is', null)
        .order('origem')
      if (error) throw error

      const origens = new Set<string>()
      for (const row of data || []) {
        if (row.origem) origens.add(row.origem)
      }
      return Array.from(origens).sort()
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}

export function useFilterDestinations() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_v2_filter_destinations', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return []
      const { data, error } = await supabase
        .from('destinations')
        .select('id, name')
        .eq('org_id', activeOrgId)
        .order('name')
      if (error) throw error
      return (data || []).map(d => ({ id: d.id, nome: d.name || '' }))
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}

export function useFilterTags() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_v2_filter_tags', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return []
      const { data, error } = await supabase
        .from('card_tags')
        .select('id, name')
        .eq('org_id', activeOrgId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return (data || []).map(t => ({ id: t.id, name: t.name || '' }))
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}
