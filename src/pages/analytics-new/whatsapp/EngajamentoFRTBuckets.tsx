import { cn } from '@/lib/utils'
import type { EngajamentoFRTBucket } from '@/types/engagement'

interface Props {
  buckets: EngajamentoFRTBucket[]
  isLoading?: boolean
}

// Cor por velocidade: rápido = verde, devagar = âmbar, sem resposta = cinza
const COLOR: Record<string, string> = {
  '< 5min':       'bg-emerald-500',
  '5-30min':      'bg-emerald-400',
  '30min-2h':     'bg-sky-400',
  '2-24h':        'bg-sky-500',
  '1-3 dias':     'bg-amber-400',
  '3-7 dias':     'bg-amber-500',
  '> 7 dias':     'bg-rose-400',
  'Sem resposta': 'bg-slate-300',
}

export default function EngajamentoFRTBuckets({ buckets, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
    )
  }

  const total = buckets.reduce((s, b) => s + b.count, 0)
  const respondedTotal = buckets
    .filter(b => b.bucket !== 'Sem resposta')
    .reduce((s, b) => s + b.count, 0)
  const maxResponded = Math.max(1, ...buckets.filter(b => b.bucket !== 'Sem resposta').map(b => b.count))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Em quanto tempo respondem
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tempo entre nossa 1ª mensagem e a resposta dela
          </p>
        </div>
        {respondedTotal > 0 && (
          <div className="text-right">
            <div className="text-xs text-slate-400">
              {respondedTotal.toLocaleString('pt-BR')} responderam
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {buckets.map((b, idx) => {
          const isResponded = b.bucket !== 'Sem resposta'
          const widthPct =
            isResponded
              ? (b.count / maxResponded) * 100
              : total === 0 ? 0 : (b.count / total) * 100
          const sharePct = total === 0 ? 0 : (b.count / total) * 100
          return (
            <div
              key={b.bucket}
              className="flex items-center gap-3"
              style={{
                animation: `frtRowEnter 280ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 40}ms both`,
              }}
            >
              <div className="w-24 text-xs font-medium text-slate-700 shrink-0 text-right">
                {b.bucket}
              </div>
              <div className="flex-1">
                <div className={cn(
                  'h-6 rounded-md relative overflow-hidden',
                  isResponded ? 'bg-slate-100' : 'bg-slate-50 border border-slate-100'
                )}>
                  <div
                    className={cn('h-full rounded-md flex items-center justify-end px-2', COLOR[b.bucket] ?? 'bg-slate-400')}
                    style={{
                      width: `${widthPct}%`,
                      transition: 'width 500ms cubic-bezier(0.23, 1, 0.32, 1)',
                    }}
                  >
                    {widthPct > 18 && (
                      <span className={cn(
                        'text-[11px] font-semibold tabular-nums',
                        isResponded ? 'text-white' : 'text-slate-700'
                      )}>
                        {b.count.toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="w-14 text-right text-xs tabular-nums text-slate-500 shrink-0">
                {widthPct <= 18 && (
                  <span className="text-slate-700 font-medium mr-1">{b.count.toLocaleString('pt-BR')}</span>
                )}
                {sharePct.toFixed(0)}%
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          Verde = respondeu rápido · âmbar = devagar · cinza = não respondeu ainda
        </span>
      </div>

      <style>{`
        @keyframes frtRowEnter {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
