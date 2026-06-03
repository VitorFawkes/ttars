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
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-ww-gold/40 disabled:opacity-50"
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

// Hook que carrega os membros do workspace (org_members — regra multi-tenant).
function useWorkspaceMembers() {
  const { org } = useOrg()
  const orgId = org?.id
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!orgId) return
      setLoading(true)
      const { data } = await db.from('org_members').select('user_id, profiles!inner(id, nome, active)').eq('org_id', orgId)
      if (!alive) return
      const rows = (data || []) as unknown as { profiles: { id: string; nome: string; active: boolean | null } }[]
      setMembers(rows.map(r => r.profiles).filter(p => p && p.active !== false).map(p => ({ id: p.id, nome: p.nome })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')))
      setLoading(false)
    }
    load(); return () => { alive = false }
  }, [orgId])
  return { members, loading }
}

// Seleção MÚLTIPLA de closers (Wedding Planners que podem receber reunião). A Sofia
// oferece horários livres de qualquer um marcado e agenda com quem estiver disponível.
export function ClosersPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { members, loading } = useWorkspaceMembers()
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">Closers que podem receber reunião (marque um ou vários)</label>
      {loading ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : members.length === 0 ? (
        <p className="text-[11px] text-amber-600">Nenhuma pessoa neste workspace ainda.</p>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {members.map(m => (
            <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={value.includes(m.id)} onChange={() => toggle(m.id)} className="accent-ww-gold" />
              {m.nome}
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-1">A Sofia não participa da reunião; ela agenda pra um destes closers.</p>
    </div>
  )
}
