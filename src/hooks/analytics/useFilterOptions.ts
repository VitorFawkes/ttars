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
    queryKey: ['analytics_filter_profiles', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return []
      // Multi-tenant: profiles "reais" moram na account pai (Welcome Group), mas são
      // membros do workspace via org_members. Buscar por membership garante a lista
      // correta em workspaces filhos onde profiles.org_id aponta pra account.
      const { data, error } = await supabase
        .from('org_members')
        .select('user_id, profiles!inner(id, nome, active)')
        .eq('org_id', activeOrgId)
      if (error) throw error
      type Row = { user_id: string; profiles: { id: string; nome: string | null; active: boolean | null } | null }
      return ((data as unknown as Row[]) || [])
        .filter(r => r.profiles && r.profiles.active !== false)
        .map(r => ({ id: r.profiles!.id, nome: r.profiles!.nome || '' }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}

export function useFilterOrigens() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_filter_origens', activeOrgId],
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
    queryKey: ['analytics_filter_destinations', activeOrgId],
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

export interface FilterTeam {
  id: string
  name: string
  phase_slug: string | null
  phase_order: number | null
  memberIds: string[]
}

/**
 * Lista times ativos do workspace + IDs dos membros de cada time.
 * Ordena pela fase do funil (SDR → Planner → Pós) e depois por nome.
 */
export function useFilterTeams() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_filter_teams', activeOrgId],
    queryFn: async (): Promise<FilterTeam[]> => {
      if (!activeOrgId) return []
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, phase_id, pipeline_phases(slug, order_index)')
        .eq('org_id', activeOrgId)
        .eq('is_active', true)
      if (error) throw error
      type Row = {
        id: string
        name: string
        phase_id: string | null
        pipeline_phases: { slug: string | null; order_index: number | null } | null
      }
      const teams = ((data as unknown as Row[]) || []).map(t => ({
        id: t.id,
        name: t.name,
        phase_slug: t.pipeline_phases?.slug ?? null,
        phase_order: t.pipeline_phases?.order_index ?? null,
      }))

      // Fetch membros de cada time — filtra por team_id + active
      const teamIds = teams.map(t => t.id)
      if (teamIds.length === 0) return []
      const { data: members, error: membersErr } = await supabase
        .from('profiles')
        .select('id, team_id, active')
        .in('team_id', teamIds)
        .neq('active', false)
      if (membersErr) throw membersErr

      const memberMap = new Map<string, string[]>()
      for (const m of (members as unknown as Array<{ id: string; team_id: string | null }>) || []) {
        if (!m.team_id) continue
        const arr = memberMap.get(m.team_id) || []
        arr.push(m.id)
        memberMap.set(m.team_id, arr)
      }

      return teams
        .map(t => ({ ...t, memberIds: memberMap.get(t.id) || [] }))
        .filter(t => t.memberIds.length > 0)
        .sort((a, b) => {
          const ao = a.phase_order ?? 9999
          const bo = b.phase_order ?? 9999
          if (ao !== bo) return ao - bo
          return a.name.localeCompare(b.name, 'pt-BR')
        })
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeOrgId,
  })
}

export function useFilterTags() {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['analytics_filter_tags', activeOrgId],
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
