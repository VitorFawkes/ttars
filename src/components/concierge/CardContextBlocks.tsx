import { Phone, Mail, MessageCircle, Users as UsersIcon, AlertTriangle, ListChecks, Tag as TagIcon, UserX } from 'lucide-react'
import { useCardPeople, type CardPerson } from '../../hooks/useCardPeople'
import { useCardObservacoes, flattenObservacoes } from '../../hooks/concierge/useCardObservacoes'
import { useAtendimentosCard } from '../../hooks/concierge/useAtendimentosCard'
import { useCardTagAssignments, useCardTags } from '../../hooks/useCardTags'
import { cn } from '../../lib/utils'

function fullName(p: CardPerson) {
  return [p.nome, p.sobrenome].filter(Boolean).join(' ') || 'Sem nome'
}

function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

interface CardContextBlocksProps {
  cardId: string
  /** Quando aberto a partir de um atendimento, exclui ele da contagem de "outras pendências" */
  excludeAtendimentoId?: string
  /** Quando renderizado dentro do drawer da viagem, omite o bloco "outras pendências" (a lista já tá embaixo) */
  showOutrasPendencias?: boolean
  /** Callback para abrir o drawer da viagem (se relevante) */
  onOpenDrawer?: () => void
}

export function CardContextBlocks({
  cardId,
  excludeAtendimentoId,
  showOutrasPendencias = true,
  onOpenDrawer,
}: CardContextBlocksProps) {
  const { primary, travelers, isLoading: loadingPeople } = useCardPeople(cardId)
  const { data: observacoes } = useCardObservacoes(cardId)
  const obsEntries = flattenObservacoes(observacoes)

  const { tagIds } = useCardTagAssignments(cardId)
  const { allTags } = useCardTags()
  const cardTags = (allTags ?? []).filter(t => tagIds.includes(t.id))

  const { data: cardItems = [] } = useAtendimentosCard(cardId)
  const outrasAbertas = cardItems.filter(i =>
    !i.outcome && !i.concluida && i.atendimento_id !== excludeAtendimentoId
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ClientePrincipalBlock person={primary} loading={loadingPeople} />
        <ViajantesBlock primary={primary} travelers={travelers} loading={loadingPeople} />
      </div>

      {cardTags.length > 0 && (
        <TagsBlock tags={cardTags} />
      )}

      {obsEntries.length > 0 && (
        <ObservacoesBlock entries={obsEntries} />
      )}

      {showOutrasPendencias && outrasAbertas.length > 0 && (
        <OutrasPendenciasBlock count={outrasAbertas.length} onOpenDrawer={onOpenDrawer} />
      )}
    </div>
  )
}

function ClientePrincipalBlock({ person, loading }: { person: CardPerson | null; loading: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-100 text-[10.5px] uppercase tracking-wide font-semibold text-slate-500">
        Cliente principal
      </div>
      <div className="p-3 space-y-2 min-h-[64px]">
        {loading ? (
          <div className="text-[12px] text-slate-400">Carregando…</div>
        ) : !person ? (
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <UserX className="w-3.5 h-3.5 text-slate-400" />
            <span>Sem cliente cadastrado neste card</span>
          </div>
        ) : (
          <>
            <div className="font-semibold text-slate-900 text-[13px] leading-snug">{fullName(person)}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {person.telefone ? (
                <>
                  <a
                    href={`tel:${person.telefone}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[11px] text-slate-700 font-mono transition"
                  >
                    <Phone className="w-3 h-3 text-slate-400" />
                    {formatPhone(person.telefone)}
                  </a>
                  {whatsappUrl(person.telefone) && (
                    <a
                      href={whatsappUrl(person.telefone) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] text-emerald-700 font-medium transition"
                      title="Abrir conversa no WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </a>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-slate-400 italic">Sem telefone</span>
              )}
              {person.email && (
                <a
                  href={`mailto:${person.email}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[11px] text-slate-700 transition truncate max-w-[180px]"
                >
                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{person.email}</span>
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ViajantesBlock({ primary, travelers, loading }: { primary: CardPerson | null; travelers: CardPerson[]; loading: boolean }) {
  const totalCount = travelers.length + (primary ? 1 : 0)

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
          <UsersIcon className="w-3 h-3" />
          Viajantes
        </span>
        {totalCount > 0 && (
          <span className="font-mono text-[10px] text-slate-400">
            {totalCount} {totalCount === 1 ? 'pessoa' : 'pessoas'}
          </span>
        )}
      </div>
      <div className="p-3 min-h-[64px]">
        {loading ? (
          <div className="text-[12px] text-slate-400">Carregando…</div>
        ) : totalCount === 0 ? (
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <UserX className="w-3.5 h-3.5 text-slate-400" />
            <span>Sem viajantes cadastrados</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {primary && (
              <PersonRow person={primary} role="titular" />
            )}
            {travelers.slice(0, 4).map(p => (
              <PersonRow key={p.id} person={p} role="" />
            ))}
            {travelers.length > 4 && (
              <li className="text-[10.5px] text-slate-400 italic">
                +{travelers.length - 4} mais no grupo
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

function PersonRow({ person, role }: { person: CardPerson; role: string }) {
  return (
    <li className="flex items-center gap-2 text-[12px]">
      <span className={cn(
        'shrink-0 w-1.5 h-1.5 rounded-full',
        person.tipo_pessoa === 'crianca' ? 'bg-pink-400' : 'bg-slate-300'
      )} />
      <span className="font-medium text-slate-800 truncate flex-1">{fullName(person)}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">
        {role && <span className="text-indigo-600 font-semibold mr-1">{role}</span>}
        {person.tipo_pessoa === 'crianca' ? 'criança' : 'adulto'}
      </span>
    </li>
  )
}

function TagsBlock({ tags }: { tags: { id: string; name: string; color: string | null }[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-100 text-[10.5px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
        <TagIcon className="w-3 h-3" />
        Tags do card
      </div>
      <div className="p-3 flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span
            key={t.id}
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border"
            style={{
              backgroundColor: t.color ? `${t.color}1A` : undefined,
              borderColor: t.color ? `${t.color}40` : undefined,
              color: t.color ?? '#475569',
            }}
          >
            {t.name}
          </span>
        ))}
      </div>
    </div>
  )
}

interface ObsEntry { key: string; label: string; value: string; source: 'briefing' | 'criticas' | 'pos_venda' }

function ObservacoesBlock({ entries }: { entries: ObsEntry[] }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-amber-200 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide font-semibold text-amber-800">
        <AlertTriangle className="w-3 h-3" />
        Observações importantes
      </div>
      <ul className="p-3 space-y-1.5">
        {entries.map((e, i) => (
          <li key={`${e.source}-${e.key}-${i}`} className="text-[12px] text-amber-900 leading-snug">
            <span className="font-semibold">{e.label}:</span> <span className="text-slate-800">{e.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OutrasPendenciasBlock({ count, onOpenDrawer }: { count: number; onOpenDrawer?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenDrawer}
      disabled={!onOpenDrawer}
      className={cn(
        'w-full bg-indigo-50/50 border border-indigo-100 rounded-lg p-2.5 flex items-center justify-between text-left transition-colors',
        onOpenDrawer ? 'hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-indigo-600" />
        <div>
          <div className="text-[12.5px] font-semibold text-indigo-900">
            {count} outra{count === 1 ? '' : 's'} pendência{count === 1 ? '' : 's'} nesta viagem
          </div>
          {onOpenDrawer && (
            <div className="text-[10.5px] text-indigo-600">Clique pra ver tudo da viagem</div>
          )}
        </div>
      </div>
    </button>
  )
}
