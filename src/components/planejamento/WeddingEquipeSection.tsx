import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, X, Briefcase, Star, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import OwnerSelector from '../pipeline/OwnerSelector'
import { useCardTeam } from '../../hooks/useCardTeam'

interface CardOwnersRow {
  pos_owner_id: string | null
  vendas_owner_id: string | null
  org_id: string | null
}

type EquipeRole = 'assistente_pos' | 'apoio'

const ROLE_META: Record<EquipeRole, { label: string; chip: string; phaseSlug?: string }> = {
  assistente_pos: { label: 'Assistente', chip: 'bg-sky-50 text-sky-700 border-sky-200', phaseSlug: 'pos_venda' },
  apoio: { label: 'Apoio', chip: 'bg-slate-50 text-slate-600 border-slate-200' },
}

const MEMBER_LABEL = (role: string) => ROLE_META[role as EquipeRole]?.label ?? role

/**
 * Bloco "Equipe do casamento" — pessoas INTERNAS (≠ casal/clientes).
 * - Planejadora (responsável) = cards.pos_owner_id, atribuída via OwnerSelector
 *   (lista por org_members, fase pos_venda). Distinta do Closer.
 * - Closer (quem fechou) = cards.vendas_owner_id — só leitura, contexto.
 * - Assistente / Apoio = card_team_members (vários), via useCardTeam.
 * Reusa a inteligência do Trips; isolamento por org_id (OwnerSelector recebe
 * orgId do card).
 */
export function WeddingEquipeSection({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient()
  const [addRole, setAddRole] = useState<EquipeRole>('assistente_pos')

  const { data: owners } = useQuery({
    queryKey: ['wedding-card-owners', cardId],
    queryFn: async (): Promise<CardOwnersRow> => {
      const { data, error } = await supabase
        .from('cards')
        .select('pos_owner_id, vendas_owner_id, org_id')
        .eq('id', cardId)
        .single()
      if (error) throw error
      return data as CardOwnersRow
    },
  })

  const { members, fullTeam, addMember, removeMember } = useCardTeam(cardId, owners ?? null)

  const setPlanejadora = useMutation({
    mutationFn: async (ownerId: string | null) => {
      const { error } = await supabase.from('cards').update({ pos_owner_id: ownerId }).eq('id', cardId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Planejadora atualizada')
      queryClient.invalidateQueries({ queryKey: ['wedding-card-owners', cardId] })
      queryClient.invalidateQueries({ queryKey: ['card', cardId] })
      queryClient.invalidateQueries({ queryKey: ['planejamento'] })
    },
    onError: (e: Error) => toast.error(`Não consegui salvar: ${e.message}`),
  })

  const closer = owners?.vendas_owner_id
    ? fullTeam.find((t) => t.profileId === owners.vendas_owner_id)
    : null

  return (
    <section className="bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]">
      <header className="flex items-center gap-2 mb-3">
        <Users className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Equipe do casamento</h2>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Planejadora */}
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Planejadora (responsável)</p>
          <OwnerSelector
            value={owners?.pos_owner_id ?? null}
            orgId={owners?.org_id ?? undefined}
            phaseSlug="pos_venda"
            showNoSdrOption
            placeholder="Atribuir planejadora"
            onChange={(id) => setPlanejadora.mutate(id)}
          />
        </div>

        {/* Closer — contexto, só leitura */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> Fechado por (Closer)
          </p>
          <p className="text-sm font-medium text-slate-700 mt-1.5 truncate">
            {closer?.nome ?? '—'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Quem vendeu — só contexto</p>
        </div>
      </div>

      {/* Assistentes / Apoio */}
      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-2">Assistentes &amp; apoio</p>
        {members.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {(m.profile?.nome || m.profile?.email || '?')[0].toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-800 truncate">{m.profile?.nome || m.profile?.email || '—'}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', ROLE_META[m.role as EquipeRole]?.chip ?? ROLE_META.apoio.chip)}>
                    {MEMBER_LABEL(m.role)}
                  </span>
                </span>
                <button
                  onClick={() => removeMember.mutate(m.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-500 transition-all"
                  title="Remover da equipe"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Adicionar pessoa */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center pt-1">
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden shrink-0">
            <RoleTab active={addRole === 'assistente_pos'} onClick={() => setAddRole('assistente_pos')} icon={<Briefcase className="w-3.5 h-3.5" />} label="Assistente" />
            <RoleTab active={addRole === 'apoio'} onClick={() => setAddRole('apoio')} icon={<Star className="w-3.5 h-3.5" />} label="Apoio" />
          </div>
          <div className="flex-1 min-w-0">
            <OwnerSelector
              value={null}
              orgId={owners?.org_id ?? undefined}
              phaseSlug={ROLE_META[addRole].phaseSlug}
              showNoSdrOption
              placeholder={`+ Adicionar ${ROLE_META[addRole].label.toLowerCase()}`}
              onChange={(id) => {
                if (id) addMember.mutate({ profileId: id, role: addRole })
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function RoleTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-colors',
        active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {icon} {label}
    </button>
  )
}
