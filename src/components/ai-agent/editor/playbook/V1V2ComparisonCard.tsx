import { Layers, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentV1V2Comparison } from '@/hooks/playbook/useAgentV1V2Comparison'

interface Props {
  agentId: string
}

/**
 * Card comparativo v1 × v2 pro admin ver se o modo Playbook tá melhor que o clássico.
 * Só aparece quando há turnos de ambas versões (caso contrário retorna null).
 */
export function V1V2ComparisonCard({ agentId }: Props) {
  const { data } = useAgentV1V2Comparison(agentId)

  if (!data || !data.v1 || !data.v2) return null

  const { v1, v2 } = data
  const tokensDelta = calcDelta(v1.avg_tokens_per_response, v2.avg_tokens_per_response, true) // menor é melhor
  const escalationDelta = calcDelta(v1.escalation_rate, v2.escalation_rate, true)

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      <header className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-900">Comparação v1 × v2 <span className="text-xs font-normal text-slate-500">(últimos 30 dias)</span></h3>
      </header>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="font-medium text-slate-500"></div>
        <div className="text-center font-semibold text-slate-700">Clássico</div>
        <div className="text-center font-semibold text-indigo-700">Playbook</div>

        <Row label="Conversas" v1={v1.conversations} v2={v2.conversations} />
        <Row label="Respostas" v1={v1.responses} v2={v2.responses} />
        <Row label="Tokens/resposta" v1={Math.round(v1.avg_tokens_per_response ?? 0)} v2={Math.round(v2.avg_tokens_per_response ?? 0)} delta={tokensDelta} />
        <Row label="Taxa de handoff" v1={fmtPct(v1.escalation_rate)} v2={fmtPct(v2.escalation_rate)} delta={escalationDelta} />
        <Row label="Score médio" v1={v1.avg_qual_score ? v1.avg_qual_score.toFixed(1) : '—'} v2={v2.avg_qual_score ? v2.avg_qual_score.toFixed(1) : '—'} />
      </div>
    </section>
  )
}

function Row({ label, v1, v2, delta }: { label: string; v1: string | number; v2: string | number; delta?: number | null }) {
  return (
    <>
      <div className="text-slate-600">{label}</div>
      <div className="text-center text-slate-700">{v1}</div>
      <div className="text-center font-medium text-indigo-700 flex items-center justify-center gap-1">
        {v2}
        {delta !== null && delta !== undefined && (
          <span className={cn('inline-flex items-center text-xs', delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-400')}>
            {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : null}
            {delta !== 0 && `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
          </span>
        )}
      </div>
    </>
  )
}

function calcDelta(a: number | null, b: number | null, lowerIsBetter: boolean): number | null {
  if (a === null || b === null || !a) return null
  const pct = ((b - a) / a) * 100
  return lowerIsBetter ? -pct : pct
}

function fmtPct(v: number | null): string {
  if (v === null) return '—'
  return `${(v * 100).toFixed(0)}%`
}
