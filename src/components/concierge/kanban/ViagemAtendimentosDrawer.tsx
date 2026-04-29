import { useState } from 'react'
import { X, ExternalLink, Calendar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAtendimentosCard } from '../../../hooks/concierge/useAtendimentosCard'
import { TipoBadge } from '../Badges'
import { AtendimentoDetailModal } from '../AtendimentoDetailModal'
import { CATEGORIAS_CONCIERGE, type MeuDiaItem } from '../../../hooks/concierge/types'
import type { ViagemKanbanItem } from '../../../hooks/concierge/useKanbanViagens'
import { cn } from '../../../lib/utils'

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function categoriaLabel(key: string) {
  return CATEGORIAS_CONCIERGE[key as keyof typeof CATEGORIAS_CONCIERGE]?.label ?? key
}

interface ViagemAtendimentosDrawerProps {
  viagem: ViagemKanbanItem | null
  onClose: () => void
}

export function ViagemAtendimentosDrawer({ viagem, onClose }: ViagemAtendimentosDrawerProps) {
  const { data: items = [], isLoading } = useAtendimentosCard(viagem?.card_id ?? null)
  const [selected, setSelected] = useState<MeuDiaItem | null>(null)

  if (!viagem) return null

  const abertos = items.filter(i => !i.outcome && !i.concluida)
  const concluidos = items.filter(i => i.outcome || i.concluida)

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold">{viagem.produto?.toUpperCase()}</div>
            <h3 className="text-lg font-bold text-slate-900 leading-snug mt-0.5">{viagem.card_titulo}</h3>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <Calendar className="w-3.5 h-3.5" />
              {fmtDate(viagem.data_viagem_inicio) ?? 'Sem data'}
              {viagem.data_viagem_fim && ` – ${fmtDate(viagem.data_viagem_fim)}`}
            </div>
          </div>
          <Link
            to={`/cards/${viagem.card_id}`}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
            title="Abrir card da viagem"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50">
          <Stat label="Abertos" value={abertos.length} tone="text-slate-900" />
          <Stat label="Vencidos" value={viagem.vencidos} tone="text-red-700" />
          <Stat label="Concluídos" value={concluidos.length} tone="text-emerald-700" />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading && (
            <div className="text-sm text-slate-500 text-center py-8">Carregando…</div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="text-sm text-slate-500 text-center py-8">
              Sem atendimentos.
            </div>
          )}

          {abertos.length > 0 && (
            <Section title="Abertos">
              {abertos.map(it => (
                <AtendimentoRow key={it.atendimento_id} item={it} onClick={() => setSelected(it)} />
              ))}
            </Section>
          )}

          {concluidos.length > 0 && (
            <Section title="Concluídos">
              {concluidos.map(it => (
                <AtendimentoRow key={it.atendimento_id} item={it} onClick={() => setSelected(it)} muted />
              ))}
            </Section>
          )}
        </div>
      </div>

      <AtendimentoDetailModal item={selected ?? undefined} open={!!selected} onClose={() => setSelected(null)} />
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <div className={cn('text-xl font-bold', tone)}>{value}</div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AtendimentoRow({ item, onClick, muted = false }: { item: MeuDiaItem; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition',
        muted && 'opacity-60'
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <TipoBadge tipo={item.tipo_concierge} size="xs" />
        {item.data_vencimento && (
          <span className="text-[11px] text-slate-500">
            {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
        {item.titulo || categoriaLabel(item.categoria)}
      </div>
      {item.outcome && (
        <div className="text-[11px] text-slate-500 mt-1 capitalize">{item.outcome}</div>
      )}
    </button>
  )
}
