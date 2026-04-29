import { useState } from 'react'
import { X, ExternalLink, Calendar, Wallet, AlertCircle, Clock, CheckCircle2, Flame } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAtendimentosCard } from '../../../hooks/concierge/useAtendimentosCard'
import { useToggleCardCritical } from '../../../hooks/concierge/useToggleCritical'
import { AtendimentoDetailModal } from '../AtendimentoDetailModal'
import { CardContextBlocks } from '../CardContextBlocks'
import { TIPO_LABEL, CATEGORIAS_CONCIERGE, type MeuDiaItem } from '../../../hooks/concierge/types'
import type { ViagemKanbanItem, SaudeViagem } from '../../../hooks/concierge/useKanbanViagens'
import { cn } from '../../../lib/utils'

const SAUDE_ACCENT: Record<SaudeViagem, string> = {
  critica:      'bg-red-500',
  em_andamento: 'bg-amber-500',
  concluida:    'bg-emerald-500',
}

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
  const { mutate: toggleCritical, isPending: togglingCritical } = useToggleCardCritical()

  if (!viagem) return null
  const isManualCritical = viagem.card_is_critical

  const abertos = items.filter(i => !i.outcome && !i.concluida)
  const concluidos = items.filter(i => i.outcome || i.concluida)
  const valor = viagem.card_valor_final ?? viagem.card_valor_estimado

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-slate-50 shadow-2xl z-50 flex flex-col">
        {/* Header — accent bar lateral colorida pela saúde */}
        <div className="relative bg-white border-b border-slate-200 px-5 py-4">
          <span className={cn('absolute left-0 top-0 bottom-0 w-1', SAUDE_ACCENT[viagem.saude])} />

          <div className="pl-2">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10.5px] text-slate-500 uppercase tracking-wide font-semibold mb-0.5 flex items-center gap-1.5">
                  <span>Viagem · {viagem.produto?.toUpperCase()}</span>
                  {isManualCritical && (
                    <span className="inline-flex items-center gap-0.5 text-red-600 normal-case">
                      <Flame className="w-3 h-3" strokeWidth={2.5} />
                      Crítica
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">{viagem.card_titulo}</h3>
              </div>
              <button
                type="button"
                onClick={() => toggleCritical({ card_id: viagem.card_id, isCritical: !isManualCritical })}
                disabled={togglingCritical}
                className={cn(
                  'shrink-0 p-1.5 rounded transition-colors',
                  isManualCritical
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                )}
                aria-label={isManualCritical ? 'Remover marcação crítica' : 'Marcar viagem como crítica'}
                title={isManualCritical ? 'Viagem crítica — clique pra remover' : 'Marcar viagem como crítica'}
              >
                <Flame className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <Link
                to={`/cards/${viagem.card_id}`}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11.5px] font-medium text-indigo-600 hover:bg-indigo-50"
                title="Abrir card da viagem"
              >
                Card completo <ExternalLink className="w-3 h-3" />
              </Link>
              <button
                onClick={onClose}
                className="shrink-0 p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-x-3 gap-y-1 text-[12px] text-slate-700 flex-wrap">
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
        </div>

        {/* Stats inline (chips compactos) */}
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-2 flex-wrap">
          <StatChip
            icon={<Clock className="w-3 h-3" />}
            label="abertos"
            value={abertos.length}
            tone="bg-slate-100 text-slate-700"
          />
          {viagem.vencidos > 0 && (
            <StatChip
              icon={<AlertCircle className="w-3 h-3" />}
              label="vencidos"
              value={viagem.vencidos}
              tone="bg-red-50 text-red-700 border border-red-200"
            />
          )}
          <StatChip
            icon={<CheckCircle2 className="w-3 h-3" />}
            label={concluidos.length === 1 ? 'concluído' : 'concluídos'}
            value={concluidos.length}
            tone="bg-emerald-50 text-emerald-700 border border-emerald-200"
          />
        </div>

        {/* Contexto do card + lista de atendimentos */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <CardContextBlocks cardId={viagem.card_id} showOutrasPendencias={false} />

          <div>
            <div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-500 mb-2">
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
              <Section title={`Abertos · ${abertos.length}`}>
                {abertos.map(it => (
                  <AtendimentoRow key={it.atendimento_id} item={it} onClick={() => setSelected(it)} />
                ))}
              </Section>
            )}

            {concluidos.length > 0 && (
              <div className={cn(abertos.length > 0 && 'mt-4')}>
                <Section title={`Concluídos · ${concluidos.length}`}>
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

function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded font-medium text-[11.5px]', tone)}>
      {icon}
      <span className="font-mono font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function AtendimentoRow({ item, onClick, muted = false }: { item: MeuDiaItem; onClick: () => void; muted?: boolean }) {
  const meta = TIPO_LABEL[item.tipo_concierge]
  const cat = CATEGORIAS_CONCIERGE[item.categoria as keyof typeof CATEGORIAS_CONCIERGE]
  const titulo = item.titulo?.trim() || (cat?.label ?? categoriaLabel(item.categoria))
  const isVencido = item.status_apresentacao === 'vencido'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full text-left bg-white border rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden',
        muted ? 'opacity-60 border-slate-200' : isVencido ? 'border-red-200' : 'border-slate-200'
      )}
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg', meta.dotColor)} />

      <div className="pl-3 pr-3 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn('inline-flex items-center text-[10px] font-semibold uppercase tracking-wide', meta.color)}>
            {meta.label}
          </span>
          {item.data_vencimento && (
            <span className={cn('text-[11px] font-mono', isVencido && !muted ? 'text-red-600 font-semibold' : 'text-slate-500')}>
              {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        <div className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2">
          {titulo}
        </div>
        {item.outcome && (
          <div className="text-[10.5px] text-slate-500 mt-1 capitalize inline-flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {item.outcome}
          </div>
        )}
      </div>
    </button>
  )
}
