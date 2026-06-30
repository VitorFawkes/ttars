import type { WwDiretoriaFase } from '@/hooks/analyticsWeddings/useWw2'
import { formatNumber } from '../lib/format'
import { FASE_UI } from './diretoriaColors'

// Tendência da coorte (entradas no período vs. período anterior).
function Tendencia({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const up = pct > 0, down = pct < 0
  const cls = up ? 'text-emerald-700 bg-emerald-50' : down ? 'text-rose-600 bg-rose-50' : 'text-slate-500 bg-slate-100'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${cls}`} title="Variação vs. período anterior (mesma coorte)">
      {up ? '↑' : down ? '↓' : '→'}{Math.abs(pct)}%
    </span>
  )
}

/**
 * Funil por COORTE: do grupo de leads que entrou no período, quantos chegaram até
 * cada etapa. Barras proporcionais (a barra representa o número) e sempre afunilam.
 */
export function DiretoriaFunil({ fases }: { fases: WwDiretoriaFase[] }) {
  const max = Math.max(1, ...fases.map((f) => f.entrou_periodo ?? 0))
  return (
    <div className="space-y-1.5">
      {fases.map((fase, i) => {
        const n = fase.entrou_periodo ?? 0
        // 0 = sem barra; >0 garante um mínimo visível
        const w = n === 0 ? 0 : Math.max(2, Math.round((n / max) * 100))
        const ui = FASE_UI[fase.key]
        const proxima = fases[i + 1]
        return (
          <div key={fase.key}>
            <div className="flex items-center gap-3">
              <span className="w-28 lg:w-32 shrink-0 inline-flex items-center gap-1.5 text-sm text-ww-n700">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ui.dot}`} />
                <span className="truncate font-medium">{fase.label}</span>
              </span>
              <div className="flex-1 min-w-0 h-7 bg-ww-cream/60 rounded">
                <div className={`h-full rounded ${ui.bar} opacity-85`} style={{ width: `${w}%` }} />
              </div>
              <span className="shrink-0 w-14 text-right text-lg font-semibold text-ww-n700 tabular-nums">{formatNumber(n)}</span>
              <span className="shrink-0 w-12 text-right"><Tendencia pct={fase.tendencia_pct} /></span>
            </div>
            {proxima && (
              <div className="flex items-center gap-1.5 pl-28 lg:pl-32 ml-3 my-1 text-xs text-ww-n500">
                <span className="text-ww-n400">↓</span>
                {fase.conversao_proxima_pct != null ? (
                  <span><span className="font-semibold text-ww-n700 tabular-nums">{fase.conversao_proxima_pct}%</span> chegaram a {proxima.label}</span>
                ) : (
                  <span>sem base no período</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
