import { useMemo } from 'react'
import { ShieldAlert, TrendingUp, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { CriterionInterligadoEditor } from '@/components/wsdr/editor/CriterionInterligadoEditor'
import { Field } from '@/components/wsdr/editor/ui/primitives'
import {
  type SofiaConfigV2, type QualCriterion, type RuleType, type CriterionKind,
  FALLBACK_OPTIONS, DEFAULT_WEIGHT_BY_IMPORTANCIA,
} from '@/components/wsdr/sofiaConfig'

type Qual = SofiaConfigV2['qualification']

const ruleOf = (c: QualCriterion): RuleType => c.rule_type ?? (c.importancia === 'desqualifica' ? 'disqualifier' : 'qualifier')
const kindOf = (c: QualCriterion): CriterionKind => c.kind ?? ((c.importancia === 'desqualifica' || c.rule_type === 'disqualifier') ? 'desqualifica' : 'sim_nao')
const weightOf = (c: QualCriterion): number => c.weight ?? DEFAULT_WEIGHT_BY_IMPORTANCIA[c.importancia]
// Pontos máximos que um critério pode dar, por tipo (sim_nao=peso; faixas/opção=maior valor; desqualifica=0).
const critMax = (c: QualCriterion): number => {
  const k = kindOf(c)
  if (k === 'desqualifica') return 0
  if (k === 'faixas_valor') return Math.max(0, ...(c.faixas ?? []).map(f => f.pontos))
  if (k === 'peso_por_opcao') return Math.max(0, ...(c.opcoes ?? []).map(o => o.pontos))
  return weightOf(c)
}

// Aba Pontuação. Mesma lógica determinística da Patricia: a IA julga, critério a critério,
// se o casal ATENDE ou não; aqui a conta é exata — soma os pesos dos que atende, aplica o
// teto dos bônus, zera se bater um desqualificador e compara com a nota mínima. O cérebro da
// Camila (escolher a próxima fala) não muda; só a forma de fechar a NOTA fica numérica.
export function ScoringEditor({ qual, onChange }: { qual: Qual; onChange: (q: Qual) => void }) {
  const enabled = qual.scoring_enabled ?? false
  const threshold = qual.threshold ?? 50
  const maxBonus = qual.max_bonus_points ?? 10
  const fallback = qual.fallback_action ?? 'material_informativo'
  const set = (patch: Partial<Qual>) => onChange({ ...qual, ...patch })

  const buckets = useMemo(() => {
    const c = qual.criteria || []
    return {
      disqualify: c.filter(x => ruleOf(x) === 'disqualifier'),
      qualify: c.filter(x => ruleOf(x) === 'qualifier'),
      bonus: c.filter(x => ruleOf(x) === 'bonus'),
    }
  }, [qual.criteria])

  // Nota máxima que o casal consegue alcançar (soma dos pesos que qualificam + teto do bônus).
  // Serve pra avisar quando a nota mínima ou as faixas ficam acima do que é possível atingir.
  const maxScore = useMemo(() => {
    const qSum = buckets.qualify.reduce((s, c) => s + critMax(c), 0)
    const bSum = Math.min(buckets.bonus.reduce((s, c) => s + critMax(c), 0), maxBonus)
    return Math.min(100, qSum + bSum)
  }, [buckets, maxBonus])
  const thresholdTooHigh = threshold > maxScore

  return (
    <div className="space-y-5">
      {/* Toggle + explicação honesta */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">Usar pontuação numérica</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Ligado: a Sofia <strong>soma os pesos</strong> dos critérios que o casal atende e só marca como <strong>qualificado</strong> a partir da nota mínima — a conta é exata (a mesma lógica da Patricia).
            Desligado: ela julga o fit livremente, sem nota mínima fixa.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={v => set({ scoring_enabled: v })} className={enabled ? 'bg-ww-gold' : ''} />
      </div>

      {enabled && (
        <>
          {/* Nota máxima alcançável — referência pra calibrar nota mínima e faixas */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-ww-gold-soft/60 border border-ww-gold/20">
            <span className="text-xs text-slate-600">Com os critérios de hoje, a nota máxima que um casal alcança é</span>
            <span className="text-sm font-bold text-ww-gold-ink">{maxScore} pontos</span>
          </div>

          {/* Config geral */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nota mínima pra qualificar" hint={thresholdTooHigh ? `⚠️ Acima da nota máxima possível (${maxScore}) — ninguém vai qualificar. Baixe pra ${maxScore} ou menos.` : 'A partir dessa nota, o casal é considerado qualificado.'}>
              <Input type="number" min={0} max={maxScore || undefined} value={threshold} onChange={e => { const v = Math.max(0, Number(e.target.value) || 0); set({ threshold: maxScore > 0 ? Math.min(v, maxScore) : v }) }} className={thresholdTooHigh ? 'border-amber-400 focus-visible:ring-amber-400' : ''} />
            </Field>
            <Field label="Teto dos bônus" hint="Quanto os sinais de bônus podem somar juntos, no máximo.">
              <Input type="number" value={maxBonus} onChange={e => set({ max_bonus_points: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Se o casal não atingir a nota mínima" hint="O que a Sofia faz quando o casal não qualifica.">
            <select
              value={fallback}
              onChange={e => set({ fallback_action: e.target.value as Qual['fallback_action'] })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ww-gold/40"
            >
              {FALLBACK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">{FALLBACK_OPTIONS.find(o => o.value === fallback)?.hint}</p>
          </Field>

          {/* Explicador visual (3 passos) */}
          <ScoringExplainer disqualify={buckets.disqualify.length} qualify={buckets.qualify.length} bonus={buckets.bonus.length} threshold={threshold} maxBonus={maxBonus} />
        </>
      )}

      {/* Critérios interligados (o que descobrir + como perguntar + como pontua) */}
      <div>
        <p className="text-sm font-medium text-slate-900 mb-2">Critérios</p>
        <CriterionInterligadoEditor criteria={qual.criteria} onChange={criteria => set({ criteria })} />
      </div>
    </div>
  )
}

function ExplainerCard({ n, icon, title, body, tone }: { n: number; icon: React.ReactNode; title: string; body: string; tone: 'red' | 'indigo' | 'emerald' }) {
  const border = { red: 'border-red-200 bg-red-50/40', indigo: 'border-ww-gold/30 bg-ww-gold-soft/40', emerald: 'border-emerald-200 bg-emerald-50/40' }[tone]
  const dot = { red: 'bg-red-100 text-red-700', indigo: 'bg-ww-gold-soft text-ww-gold-ink', emerald: 'bg-emerald-100 text-emerald-700' }[tone]
  return (
    <div className={cn('rounded-xl border p-4', border)}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', dot)}>{n}</span>
        {icon}
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
    </div>
  )
}

function ScoringExplainer({ disqualify, qualify, bonus, threshold, maxBonus }: { disqualify: number; qualify: number; bonus: number; threshold: number; maxBonus: number }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Como a nota funciona</p>
      <div className="grid md:grid-cols-3 gap-3">
        <ExplainerCard n={1} tone="red" icon={<ShieldAlert className="w-4 h-4 text-red-600" />} title="Desqualifica" body={`Se um dos ${disqualify} alertas vermelhos bater, o casal cai direto, sem somar pontos.`} />
        <ExplainerCard n={2} tone="indigo" icon={<TrendingUp className="w-4 h-4 text-ww-gold-ink" />} title="Soma pontos" body={`Os ${qualify} critérios que qualificam somam pontos. Ao atingir ${threshold}, o casal qualifica.`} />
        <ExplainerCard n={3} tone="emerald" icon={<Sparkles className="w-4 h-4 text-emerald-600" />} title="Bônus" body={`Os ${bonus} sinais de bônus reforçam, somando até ${maxBonus} no total. Não decidem sozinhos.`} />
      </div>
    </div>
  )
}
