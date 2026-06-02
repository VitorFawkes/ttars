import { useMemo, useState } from 'react'
import { ShieldAlert, TrendingUp, Sparkles, FlaskConical } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { CriteriaEditor } from '@/components/wsdr/editor/CriteriaEditor'
import { Field } from '@/components/wsdr/editor/ui/primitives'
import {
  type SofiaConfigV2, type QualCriterion, type RuleType,
  FALLBACK_OPTIONS, DEFAULT_WEIGHT_BY_IMPORTANCIA,
} from '@/components/wsdr/sofiaConfig'

type Qual = SofiaConfigV2['qualification']

const ruleOf = (c: QualCriterion): RuleType => c.rule_type ?? (c.importancia === 'desqualifica' ? 'disqualifier' : 'qualifier')
const weightOf = (c: QualCriterion): number => c.weight ?? DEFAULT_WEIGHT_BY_IMPORTANCIA[c.importancia]

// Aba Pontuação. Mesma lógica determinística da Patricia: a IA julga, critério a critério,
// se o casal ATENDE ou não; aqui a conta é exata — soma os pesos dos que atende, aplica o
// teto dos bônus, zera se bater um desqualificador e compara com a nota mínima. O cérebro da
// Camila (escolher a próxima fala) não muda; só a forma de fechar a NOTA fica numérica.
export function ScoringEditor({ qual, onChange }: { qual: Qual; onChange: (q: Qual) => void }) {
  const enabled = qual.scoring_enabled ?? false
  const threshold = qual.threshold ?? 50
  const maxBonus = qual.max_bonus_points ?? 10
  const quente = qual.bands?.quente ?? 80
  const morno = qual.bands?.morno ?? 50
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
    const qSum = buckets.qualify.reduce((s, c) => s + weightOf(c), 0)
    const bSum = Math.min(buckets.bonus.reduce((s, c) => s + weightOf(c), 0), maxBonus)
    return Math.min(100, qSum + bSum)
  }, [buckets, maxBonus])
  const thresholdTooHigh = threshold > maxScore
  const quenteUnreachable = quente > maxScore

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
        <Switch checked={enabled} onCheckedChange={v => set({ scoring_enabled: v })} className={enabled ? 'bg-indigo-600' : ''} />
      </div>

      {enabled && (
        <>
          {/* Nota máxima alcançável — referência pra calibrar nota mínima e faixas */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100">
            <span className="text-xs text-slate-600">Com os critérios de hoje, a nota máxima que um casal alcança é</span>
            <span className="text-sm font-bold text-indigo-700">{maxScore} pontos</span>
          </div>

          {/* Config geral */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nota mínima pra qualificar" hint={thresholdTooHigh ? `⚠️ Acima da nota máxima possível (${maxScore}) — ninguém vai qualificar. Baixe pra ${maxScore} ou menos.` : 'A partir dessa nota, o casal é considerado qualificado.'}>
              <Input type="number" value={threshold} onChange={e => set({ threshold: Number(e.target.value) })} className={thresholdTooHigh ? 'border-amber-400 focus-visible:ring-amber-400' : ''} />
            </Field>
            <Field label="Teto dos bônus" hint="Quanto os sinais de bônus podem somar juntos, no máximo.">
              <Input type="number" value={maxBonus} onChange={e => set({ max_bonus_points: Number(e.target.value) })} />
            </Field>
            <Field label="Faixa “quente” a partir de" hint={quenteUnreachable ? `⚠️ Acima da nota máxima (${maxScore}) — nenhum casal vai chegar a “quente”.` : 'Nota igual ou acima = casal quente.'}>
              <Input type="number" value={quente} onChange={e => set({ bands: { quente: Number(e.target.value), morno } })} className={quenteUnreachable ? 'border-amber-400 focus-visible:ring-amber-400' : ''} />
            </Field>
            <Field label="Faixa “morno” a partir de" hint="Entre morno e quente = morno; abaixo = frio.">
              <Input type="number" value={morno} onChange={e => set({ bands: { quente, morno: Number(e.target.value) } })} />
            </Field>
          </div>
          <Field label="Se o casal não atingir a nota mínima" hint="O que a Sofia faz quando o casal não qualifica.">
            <select
              value={fallback}
              onChange={e => set({ fallback_action: e.target.value as Qual['fallback_action'] })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {FALLBACK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">{FALLBACK_OPTIONS.find(o => o.value === fallback)?.hint}</p>
          </Field>

          {/* Explicador visual (3 passos) */}
          <ScoringExplainer disqualify={buckets.disqualify.length} qualify={buckets.qualify.length} bonus={buckets.bonus.length} threshold={threshold} maxBonus={maxBonus} />
        </>
      )}

      {/* Critérios com pontos */}
      <div>
        <p className="text-sm font-medium text-slate-900 mb-2">Critérios e pontos</p>
        <CriteriaEditor criteria={qual.criteria} onChange={criteria => set({ criteria })} showScoring />
      </div>

      {/* Simulador */}
      {enabled && <Simulator criteria={qual.criteria} threshold={threshold} maxBonus={maxBonus} quente={quente} morno={morno} />}
    </div>
  )
}

function ExplainerCard({ n, icon, title, body, tone }: { n: number; icon: React.ReactNode; title: string; body: string; tone: 'red' | 'indigo' | 'emerald' }) {
  const border = { red: 'border-red-200 bg-red-50/40', indigo: 'border-indigo-200 bg-indigo-50/40', emerald: 'border-emerald-200 bg-emerald-50/40' }[tone]
  const dot = { red: 'bg-red-100 text-red-700', indigo: 'bg-indigo-100 text-indigo-700', emerald: 'bg-emerald-100 text-emerald-700' }[tone]
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
        <ExplainerCard n={2} tone="indigo" icon={<TrendingUp className="w-4 h-4 text-indigo-600" />} title="Soma pontos" body={`Os ${qualify} critérios que qualificam somam pontos. Ao atingir ${threshold}, o casal qualifica.`} />
        <ExplainerCard n={3} tone="emerald" icon={<Sparkles className="w-4 h-4 text-emerald-600" />} title="Bônus" body={`Os ${bonus} sinais de bônus reforçam, somando até ${maxBonus} no total. Não decidem sozinhos.`} />
      </div>
    </div>
  )
}

function Simulator({ criteria, threshold, maxBonus, quente, morno }: { criteria: QualCriterion[]; threshold: number; maxBonus: number; quente: number; morno: number }) {
  const [on, setOn] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setOn(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })

  const result = useMemo(() => {
    let score = 0, bonusRaw = 0, dq = false
    criteria.forEach((c, i) => {
      if (!on.has(i)) return
      const rt = ruleOf(c)
      if (rt === 'disqualifier') dq = true
      else if (rt === 'bonus') bonusRaw += weightOf(c)
      else score += weightOf(c)
    })
    if (dq) return { score: 0, dq: true, faixa: 'frio' as const, qualificado: false }
    const total = Math.min(100, score + Math.min(bonusRaw, maxBonus))
    const faixa = total >= quente ? 'quente' : total >= morno ? 'morno' : 'frio'
    return { score: total, dq: false, faixa, qualificado: total >= threshold }
  }, [criteria, on, maxBonus, quente, morno, threshold])

  const faixaColor = result.faixa === 'quente' ? 'text-rose-600' : result.faixa === 'morno' ? 'text-amber-600' : 'text-slate-500'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="w-4 h-4 text-indigo-600" />
        <h4 className="text-sm font-semibold text-slate-900">Simulador</h4>
        <span className="text-xs text-slate-400">marque o que o casal atendeu e veja a nota</span>
      </div>
      <div className="space-y-1.5 mb-3">
        {criteria.filter(c => c.label.trim()).map((c, i) => (
          <label key={i} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={on.has(i)} onChange={() => toggle(i)} className="accent-indigo-600" />
            <span className="truncate">{c.label}</span>
            <span className="text-xs text-slate-400 ml-auto">{ruleOf(c) === 'disqualifier' ? 'desqualifica' : `+${weightOf(c)}`}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-500">{result.dq ? 'Desqualificado' : `Nota ${result.score}`} · <span className={cn('font-semibold capitalize', faixaColor)}>{result.faixa}</span></span>
        <span className={cn('text-sm font-semibold', result.qualificado ? 'text-emerald-700' : 'text-slate-400')}>
          {result.qualificado ? 'Qualifica ✓' : `Falta pra ${threshold}`}
        </span>
      </div>
    </div>
  )
}
