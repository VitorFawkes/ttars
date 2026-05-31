import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/lib/supabase'

const db = supabase as unknown as SupabaseClient

interface Member { id: string; nome: string }

// Dropdown da Wedding Planner. Lista os MEMBROS do workspace via org_members
// (profiles.org_id aponta pra account pai em workspace filho — usar org_members,
// regra multi-tenant do CLAUDE.md). O valor salvo é o profile id (responsavel da tarefa).
export function WeddingPlannerPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { org } = useOrg()
  const orgId = org?.id
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!orgId) return
      setLoading(true)
      const { data } = await db
        .from('org_members')
        .select('user_id, profiles!inner(id, nome, active)')
        .eq('org_id', orgId)
      if (!alive) return
      const rows = (data || []) as unknown as { profiles: { id: string; nome: string; active: boolean | null } }[]
      const list = rows
        .map(r => r.profiles)
        .filter(p => p && p.active !== false)
        .map(p => ({ id: p.id, nome: p.nome }))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      setMembers(list)
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId])

  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">Wedding Planner (recebe as reuniões)</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={loading}
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
      >
        <option value="">{loading ? 'Carregando…' : 'Selecione uma pessoa'}</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </select>
      {!loading && members.length === 0 && (
        <p className="text-[11px] text-amber-600 mt-1">Nenhuma pessoa neste workspace ainda.</p>
      )}
    </div>
  )
}
