import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, X, Briefcase, Star, Lock, Plus } from 'lucide-react'
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

const ROLE_META: Record<EquipeRole, { label: string; avatar: string; phaseSlug?: string }> = {
  assistente_pos: { label: 'Assistente', avatar: '#874B52', phaseSlug: 'pos_venda' },
  apoio: { label: 'Apoio', avatar: '#A8A99E' },
}
const MEMBER_LABEL = (role: string) => ROLE_META[role as EquipeRole]?.label ?? role
const MEMBER_AVATAR = (role: string) => ROLE_META[role as EquipeRole]?.avatar ?? '#A8A99E'

const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]'
const LBL = "text-[10px] font-bold uppercase tracking-[0.1em] text-[#A89A86] [font-family:'Nunito',sans-serif]"

/**
 * Equipe do casamento — pessoas INTERNAS (≠ casal/clientes).
 * Planejadora = pos_owner_id (OwnerSelector, org_members, fase pos_venda).
 * Closer = vendas_owner_id (só leitura). Assistente/Apoio = card_team_members
 * (vários, em chips). Reusa a inteligência do Trips; isolado por org_id.
 */
export function WeddingEquipeSection({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
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

  const closer = owners?.vendas_owner_id ? fullTeam.find((t) => t.profileId === owners.vendas_owner_id) : null

  return (
    <section className={CARD}>
      <header className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Equipe do casamento</h2>
      </header>

      {/* Planejadora (responsável) */}
      <div className="rounded-xl border border-[#ECDCBE] bg-[#FCF7EE] p-3">
        <p className={LBL}>Planejadora · responsável</p>
        <div className="mt-1.5">
          <OwnerSelector
            value={owners?.pos_owner_id ?? null}
            orgId={owners?.org_id ?? undefined}
            phaseSlug="pos_venda"
            compact
            showNoSdrOption
            placeholder="Atribuir planejadora"
            onChange={(id) => setPlanejadora.mutate(id)}
          />
        </div>
      </div>

      {/* Closer — só contexto */}
      <div className="mt-2.5 rounded-xl border border-[#EAE1D3] bg-[#FBF8F3] p-3 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-[#A89A86]" />
        <span className={LBL}>Fechado por · Closer</span>
        <span className="ml-auto text-[13px] font-semibold text-[#5C5751] truncate [font-family:'Roboto',sans-serif]">{closer?.nome ?? '—'}</span>
      </div>

      {/* Assistentes & apoio */}
      <p className={cn(LBL, 'mt-4 mb-2.5')}>Assistentes &amp; apoio</p>
      <div className="flex flex-wrap gap-2 items-center">
        {members.map((m) => (
          <span key={m.id} className="group inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-[#E0D6C8] bg-white text-[12.5px] font-semibold text-[#5C5751]">
            <span className="w-6 h-6 rounded-full text-white text-[10px] font-bold grid place-items-center shrink-0" style={{ background: MEMBER_AVATAR(m.role) }}>
              {(m.profile?.nome || m.profile?.email || '?')[0].toUpperCase()}
            </span>
            <span className="truncate max-w-[160px]">{m.profile?.nome || m.profile?.email || '—'}</span>
            <span className="text-[#A89A86]">· {MEMBER_LABEL(m.role)}</span>
            <button
              onClick={() => removeMember.mutate(m.id)}
              className="ml-0.5 p-0.5 rounded-full text-[#C9BEAD] hover:text-rose-500 hover:bg-rose-50"
              title="Remover"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-full border border-dashed border-[#D9CFC2] text-[#8A8278] text-[12.5px] font-semibold hover:bg-[#FBF8F3]"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar pessoa
          </button>
        )}
      </div>

      {/* Inline add (revela só ao clicar) */}
      {adding && (
        <div className="mt-3 rounded-xl border border-[#EAE1D3] bg-[#FBF8F3] p-3 flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <div className="inline-flex rounded-lg border border-[#E0D6C8] overflow-hidden shrink-0 bg-white">
            <RoleTab active={addRole === 'assistente_pos'} onClick={() => setAddRole('assistente_pos')} icon={<Briefcase className="w-3.5 h-3.5" />} label="Assistente" />
            <RoleTab active={addRole === 'apoio'} onClick={() => setAddRole('apoio')} icon={<Star className="w-3.5 h-3.5" />} label="Apoio" />
          </div>
          <div className="flex-1 min-w-0">
            <OwnerSelector
              value={null}
              orgId={owners?.org_id ?? undefined}
              phaseSlug={ROLE_META[addRole].phaseSlug}
              compact
              showNoSdrOption
              placeholder={`Escolher ${ROLE_META[addRole].label.toLowerCase()}…`}
              onChange={(id) => {
                if (id) {
                  addMember.mutate({ profileId: id, role: addRole })
                  setAdding(false)
                }
              }}
            />
          </div>
          <button type="button" onClick={() => setAdding(false)} className="text-[12px] font-semibold text-[#8A8278] hover:text-[#5C5751] px-2 shrink-0">
            Cancelar
          </button>
        </div>
      )}
    </section>
  )
}

function RoleTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition-colors',
        active ? 'bg-[#BD965C] text-white' : 'bg-white text-[#8A8278] hover:bg-[#FBF8F3]',
      )}
    >
      {icon} {label}
    </button>
  )
}
