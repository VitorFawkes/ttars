import { cn } from '@/lib/utils'
import type {
  ConversationState,
  EngajamentoDepthBucket,
  EngajamentoStateBucket,
} from '@/types/engagement'

interface Props {
  states: EngajamentoStateBucket[]
  depths: EngajamentoDepthBucket[]
  isLoading?: boolean
  activeState: ConversationState | null
  onToggleState: (state: ConversationState) => void
}

const STATE_META: Record<
  ConversationState,
  { label: string; color: string; bar: string; description: string }
> = {
  hot: {
    label: 'Quente',
    color: 'text-rose-700',
    bar: 'bg-rose-500',
    description: 'inbound nas últimas 24h',
  },
  warm: {
    label: 'Morna',
    color: 'text-amber-700',
    bar: 'bg-amber-500',
    description: 'inbound nos últimos 7 dias',
  },
  lost: {
    label: 'Sumiu',
    color: 'text-slate-700',
    bar: 'bg-slate-500',
    description: 'respondeu, mas parou 48h+',
  },
  cold: {
    label: 'Nunca respondeu',
    color: 'text-slate-500',
    bar: 'bg-slate-300',
    description: 'recebeu nossa msg, sem retorno',
  },
  won: {
    label: 'Ganha',
    color: 'text-emerald-700',
    bar: 'bg-emerald-500',
    description: 'virou venda no SDR ou comercial',
  },
}

export default function EngajamentoDistribuicoes({
  states,
  depths,
  isLoading,
  activeState,
  onToggleState,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  const stateTotal = states.reduce((s, x) => s + x.count, 0)
  const depthTotal = depths.reduce((s, x) => s + x.count, 0)
  const maxDepth = Math.max(1, ...depths.map(d => d.count))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Como cada conversa está
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Clique pra filtrar a tabela e o funil pelo estado
          </p>
        </div>

        <div className="flex h-3 rounded-full overflow-hidden border border-slate-200/70 mb-4">
          {states.map(s => {
            const meta = STATE_META[s.state]
            const widthPct = stateTotal === 0 ? 0 : (s.count / stateTotal) * 100
            if (widthPct === 0) return null
            return (
              <div
                key={s.state}
                className={cn(meta.bar, 'transition-all')}
                style={{ width: `${widthPct}%` }}
                title={`${meta.label}: ${s.count} (${widthPct.toFixed(1)}%)`}
              />
            )
          })}
        </div>

        <div className="space-y-1.5">
          {states.map(s => {
            const meta = STATE_META[s.state]
            const widthPct = stateTotal === 0 ? 0 : (s.count / stateTotal) * 100
            const isActive = activeState === s.state
            return (
              <button
                key={s.state}
                onClick={() => onToggleState(s.state)}
                className={cn(
                  'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150',
                  isActive
                    ? 'bg-slate-100'
                    : 'hover:bg-slate-50 active:scale-[0.99]'
                )}
              >
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', meta.bar)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn('text-sm font-medium', meta.color)}>
                      {meta.label}
                    </span>
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-sm font-semibold text-slate-900">
                        {s.count.toLocaleString('pt-BR')}
                      </span>
                      <span className="text-xs text-slate-400">{widthPct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">{meta.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Quantas vezes a pessoa respondeu
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição do número de inbounds por conversa
          </p>
        </div>

        <div className="space-y-2">
          {depths.map((d, idx) => {
            const widthPct = (d.count / maxDepth) * 100
            const sharePct = depthTotal === 0 ? 0 : (d.count / depthTotal) * 100
            return (
              <div
                key={d.bucket}
                className="flex items-center gap-3"
                style={{
                  animation: `depthRowEnter 320ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 50}ms both`,
                }}
              >
                <div className="w-28 text-sm font-medium text-slate-700 shrink-0">
                  {d.bucket}
                </div>
                <div className="flex-1 relative">
                  <div className="h-7 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-md flex items-center justify-end px-2"
                      style={{
                        width: `${widthPct}%`,
                        transition:
                          'width 500ms cubic-bezier(0.23, 1, 0.32, 1)',
                      }}
                    >
                      {widthPct > 20 && (
                        <span className="text-xs font-semibold text-white tabular-nums">
                          {d.count.toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-16 text-right text-xs tabular-nums text-slate-500 shrink-0">
                  {widthPct <= 20 && (
                    <span className="text-slate-700 font-medium mr-1">
                      {d.count.toLocaleString('pt-BR')}
                    </span>
                  )}
                  {sharePct.toFixed(0)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes depthRowEnter {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
