import { useState } from 'react'
import { X, ExternalLink, Calendar, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAtendimentosCard } from '../../../hooks/concierge/useAtendimentosCard'
import { TipoBadge } from '../Badges'
import { AtendimentoDetailModal } from '../AtendimentoDetailModal'
import { CardContextBlocks } from '../CardContextBlocks'
import { CATEGORIAS_CONCIERGE, type MeuDiaItem } from '../../../hooks/concierge/types'
import type { ViagemKanbanItem } from '../../../hooks/concierge/useKanbanViagens'
import { cn } from '../../../lib/utils'

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtBRL(v: number | null | undefined) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
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
  const valor = viagem.card_valor_final ?? viagem.card_valor_estimado

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-slate-50 shadow-xl z-50 flex flex-col">
        {/* Header — viagem */}
        <div className="bg-white border-b border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] text-slate-500 uppercase tracking-wide font-semibold">{viagem.produto?.toUpperCase()}</div>
              <h3 className="text-lg font-bold text-slate-900 leading-snug mt-0.5">{viagem.card_titulo}</h3>
            </div>
            <Link
              to={`/cards/${viagem.card_id}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11.5px] font-medium text-indigo-600 hover:bg-indigo-50"
              title="Abrir card da viagem"
            >
              Card completo <ExternalLink className="w-3 h-3" />
            </Link>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-700 flex-wrap">
            {viagem.data_viagem_inicio && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">
                  {fmtDate(viagem.data_viagem_inicio)}
                  {viagem.data_viagem_fim && ` – ${fmtDate(viagem.data_viagem_fim)}`}
                </span>
              </span>
            )}
            {viagem.dias_pra_embarque !== null && (
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded font-mono text-[11.5px] font-semibold',
                viagem.dias_pra_embarque < 0 ? 'bg-slate-100 text-slate-600' :
                viagem.dias_pra_embarque <= 2 ? 'bg-red-50 text-red-700' :
                viagem.dias_pra_embarque <= 7 ? 'bg-amber-50 text-amber-700' :
                'bg-slate-50 text-slate-600'
              )}>
                {viagem.dias_pra_embarque < 0
                  ? `Voltou há ${-viagem.dias_pra_embarque}d`
                  : viagem.dias_pra_embarque === 0
                  ? 'Embarca hoje'
                  : `Embarca em ${viagem.dias_pra_embarque}d`}
              </span>
            )}
            {valor != null && valor > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-700">
                <Wallet className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono font-semibold">{fmtBRL(valor)}</span>
                {viagem.card_valor_final == null && <span className="text-[10.5px] text-slate-400 italic">est.</span>}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-200 bg-white">
          <Stat label="Abertos" value={abertos.length} tone="text-slate-900" />
          <Stat label="Vencidos" value={viagem.vencidos} tone="text-red-700" />
          <Stat label="Concluídos" value={concluidos.length} tone="text-emerald-700" />
        </div>

        {/* Conteúdo: contexto do card + lista de tarefas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <CardContextBlocks
            cardId={viagem.card_id}
            showOutrasPendencias={false}
          />

          <div>
            <div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
              Atendimentos
            </div>

            {isLoading && (
              <div className="text-sm text-slate-500 text-center py-6">Carregando…</div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-6 bg-white border border-slate-200 rounded-lg">
                Sem atendimentos cadastrados.
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
              <div className={cn(abertos.length > 0 && 'mt-4')}>
                <Section title="Concluídos">
                  {concluidos.map(it => (
                    <AtendimentoRow key={it.atendimento_id} item={it} onClick={() => setSelected(it)} muted />
                  ))}
                </Section>
              </div>
            )}
          </div>
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
      <div className="text-[10.5px] text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-2">{title}</div>
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
