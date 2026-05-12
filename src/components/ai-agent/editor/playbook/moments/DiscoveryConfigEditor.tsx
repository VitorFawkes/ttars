import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, X, ChevronDown, ChevronRight, ShieldAlert, Zap, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { SingleFieldPicker } from '@/components/ai-agent/editor/CRMFieldPicker'
import { resolveSlotPriority, type DiscoveryConfig, type DiscoverySlot, type SlotPriority } from '@/hooks/playbook/useAgentMoments'
import { detectLeaks, type LeakWarning } from '@/lib/playbook/leakDetector'
import { renderSlotForPrompt, renderSlotLegacyForPreview, type SlotV2 } from '@/lib/slotRenderer'

const PRIORITY_OPTIONS: Array<{
  value: SlotPriority;
  label: string;
  description: string;
  icon: typeof ShieldAlert;
  cardClass: string;
  iconClass: string;
}> = [
  {
    value: 'critical',
    label: 'Crítica',
    description: 'A agente bloqueia o avanço pra reunião até coletar isso. Use pra dados que a Wedding Planner PRECISA ter na reunião (data, destino, convidados, orçamento).',
    icon: ShieldAlert,
    cardClass: 'border-rose-200 bg-rose-50',
    iconClass: 'text-rose-600',
  },
  {
    value: 'preferred',
    label: 'Importante',
    description: 'A agente pergunta enquanto a conversa está rolando. Quando o lead já bateu o score mínimo + as críticas, ela pula essa pra ir fechar reunião. Bom contexto, mas não trava nada.',
    icon: Zap,
    cardClass: 'border-amber-200 bg-amber-50',
    iconClass: 'text-amber-600',
  },
  {
    value: 'nice_to_have',
    label: 'Extra',
    description: 'A agente só pergunta se a conversa fluir naturalmente pra esse tema. Nunca trava nada nem força a coleta. Bom pra cores, temas, vendors — assuntos da Wedding Planner mesmo.',
    icon: Sparkles,
    cardClass: 'border-slate-200 bg-slate-50',
    iconClass: 'text-slate-500',
  },
]

interface Props {
  value: DiscoveryConfig | null
  onChange: (next: DiscoveryConfig) => void
  /** Pipeline do produto pra alimentar o SingleFieldPicker (campos do CRM). */
  pipelineId?: string
  produtoSlug?: string
}

/**
 * Editor da Sondagem: cada "informação a coletar" (slot) com perguntas escritas
 * opcionais. Sem perguntas, a agente improvisa baseado no rótulo.
 *
 * Princípios:
 *   - Tudo CRUD pela UI (adiciona/edita/remove qualquer slot e qualquer pergunta).
 *   - Asterisco vermelho = obrigatório pra qualificar.
 *   - Microcopy explica o que vira o quê pro agente.
 */
export function DiscoveryConfigEditor({ value, onChange, pipelineId, produtoSlug }: Props) {
  const slots = value?.slots ?? []

  const updateSlot = (idx: number, next: Partial<DiscoverySlot>) => {
    const list = [...slots]
    list[idx] = { ...list[idx], ...next }
    onChange({ slots: list })
  }

  const removeSlot = (idx: number) => {
    if (!confirm(`Remover a informação "${slots[idx].label}"?`)) return
    onChange({ slots: slots.filter((_, i) => i !== idx) })
  }

  const addSlot = () => {
    const nextKey = `info_${Date.now().toString(36).slice(-4)}`
    onChange({
      slots: [
        ...slots,
        {
          key: nextKey,
          label: 'Nova informação',
          icon: '',
          required: false,
          questions: [],
          crm_field_key: null,
        },
      ],
    })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-slate-900">Informações que ela precisa coletar</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Cada informação pode ter perguntas escritas (a agente usa) ou ficar vazio (a agente improvisa).
          </p>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500 mb-3">Nenhuma informação configurada.</p>
          <Button size="sm" variant="outline" onClick={addSlot} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adicionar a primeira informação
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {slots.map((slot, idx) => (
              <SlotItem
                key={slot.key + idx}
                slot={slot}
                onChange={(next) => updateSlot(idx, next)}
                onRemove={() => removeSlot(idx)}
                pipelineId={pipelineId}
                produtoSlug={produtoSlug}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="outline" onClick={addSlot} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Adicionar informação
            </Button>
            <p className="text-[11px] text-slate-400 whitespace-nowrap">
              Marque cada pergunta como Crítica, Importante ou Extra
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function SlotItem({
  slot,
  onChange,
  onRemove,
  pipelineId,
  produtoSlug,
}: {
  slot: DiscoverySlot
  onChange: (next: Partial<DiscoverySlot>) => void
  onRemove: () => void
  pipelineId?: string
  produtoSlug?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newMustCollect, setNewMustCollect] = useState('')
  const [newRejPattern, setNewRejPattern] = useState('')
  const [newRejHint, setNewRejHint] = useState('')
  const [showLegacyCoverage, setShowLegacyCoverage] = useState(
    !!(slot.coverage_notes && slot.coverage_notes.trim()),
  )

  const mustCollect = slot.must_collect ?? []
  const rejectIf = slot.reject_if ?? []

  const addQuestion = () => {
    const q = newQuestion.trim()
    if (!q) return
    onChange({ questions: [...slot.questions, q] })
    setNewQuestion('')
  }

  const removeQuestion = (i: number) => {
    onChange({ questions: slot.questions.filter((_, j) => j !== i) })
  }

  const addMustCollect = () => {
    const v = newMustCollect.trim()
    if (!v) return
    onChange({ must_collect: [...mustCollect, v] })
    setNewMustCollect('')
  }

  const removeMustCollect = (i: number) => {
    onChange({ must_collect: mustCollect.filter((_, j) => j !== i) })
  }

  const addRejection = () => {
    const p = newRejPattern.trim()
    if (!p) return
    onChange({ reject_if: [...rejectIf, { pattern: p, hint: newRejHint.trim() || undefined }] })
    setNewRejPattern('')
    setNewRejHint('')
  }

  const removeRejection = (i: number) => {
    onChange({ reject_if: rejectIf.filter((_, j) => j !== i) })
  }

  // Preview da pergunta auto-gerada do must_collect.
  const generatedPreview = (() => {
    if (mustCollect.length === 0) return null
    const items = mustCollect.map(s => s.trim()).filter(Boolean)
    if (items.length === 0) return null
    const joined = items.length === 1
      ? items[0]
      : items.length === 2
        ? `${items[0]} e ${items[1]}`
        : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
    const labelMatch = slot.label.match(/^(.+?)\s*[-–—]\s*(.+)$/)
    const ctx = labelMatch ? labelMatch[1].trim() : slot.label
    if (ctx && ctx.length > 0) {
      const isData = ctx.toLowerCase().startsWith('data')
      return `Vocês já sabem o ${joined} ${isData ? 'do casamento' : `de ${ctx.toLowerCase()}`}?`
    }
    return `Vocês já sabem o ${joined}?`
  })()

  return (
    <div className={cn('bg-white border rounded-lg', expanded ? 'border-slate-300' : 'border-slate-200')}>
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left text-slate-400 hover:text-slate-700"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span className="text-base leading-none">{slot.icon || '🔹'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5 min-w-0">
              <span className="truncate flex-1 min-w-0">{slot.label}</span>
              {(() => {
                const prio = resolveSlotPriority(slot)
                const opt = PRIORITY_OPTIONS.find(o => o.value === prio)
                if (!opt) return null
                const Icon = opt.icon
                return (
                  <span
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                      opt.cardClass,
                      opt.iconClass,
                    )}
                    title={opt.description}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {opt.label}
                  </span>
                )
              })()}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {slot.questions.length === 0
                ? 'sem perguntas escritas — agente improvisa'
                : `${slot.questions.length} pergunta${slot.questions.length > 1 ? 's' : ''} escrita${slot.questions.length > 1 ? 's' : ''}`}
              {slot.coverage_notes && slot.coverage_notes.trim() && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-medium">
                  + contexto
                </span>
              )}
            </div>
          </div>
        </button>
      </header>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-slate-100">
          <div className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Ícone</label>
              <input
                value={slot.icon ?? ''}
                onChange={(e) => onChange({ icon: e.target.value })}
                placeholder="📅"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center"
                maxLength={4}
              />
            </div>
            <div className="col-span-10">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Nome da informação</label>
              <input
                value={slot.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Ex: Data do casamento"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              Quão importante é coletar essa informação?
            </label>
            <div className="space-y-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const currentPriority = resolveSlotPriority(slot)
                const isActive = currentPriority === opt.value
                const Icon = opt.icon
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors',
                      isActive ? opt.cardClass : 'bg-white border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <input
                      type="radio"
                      name={`priority-${slot.key}`}
                      checked={isActive}
                      onChange={() => onChange({
                        priority: opt.value,
                        // Mantém required em sync pra backward compat (telas legadas).
                        required: opt.value === 'critical',
                      })}
                      className="mt-0.5"
                    />
                    <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', opt.iconClass)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                      <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">{opt.description}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Liga ao campo do CRM (opcional)
            </label>
            <SingleFieldPicker
              value={slot.crm_field_key ?? null}
              onChange={(v) => onChange({ crm_field_key: v || null })}
              scope="card"
              pipelineId={pipelineId}
              produto={produtoSlug}
              placeholder="Escolha um campo do card..."
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Se escolher, conecta esta informação aos critérios de qualificação que usam esse campo.
            </p>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-emerald-900 mb-1">
                Dados que a resposta DEVE coletar
              </label>
              <p className="text-[10px] text-emerald-800 mb-2 leading-relaxed">
                Cada item é uma exigência atômica. Sistema regera a resposta se a agente esquecer algum.
              </p>
              {mustCollect.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {mustCollect.map((item, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-900 inline-flex items-center gap-1.5 font-medium">
                      {item}
                      <button onClick={() => removeMustCollect(i)} className="text-emerald-600 hover:text-rose-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newMustCollect}
                  onChange={(e) => setNewMustCollect(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addMustCollect()
                    }
                  }}
                  placeholder='Ex: mês'
                  className="flex-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs"
                />
                <Button size="sm" variant="outline" onClick={addMustCollect} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> adicionar
                </Button>
              </div>
            </div>

            <div className="border-t border-emerald-200 pt-2.5">
              <label className="block text-[11px] font-medium text-emerald-900 mb-1">
                Rejeições <span className="text-emerald-700 font-normal">(opcional)</span>
              </label>
              <p className="text-[10px] text-emerald-800 mb-2 leading-relaxed">
                Se o lead responder vagamente (ex: "no fim do ano"), agente pede o detalhe que faltou.
              </p>
              {rejectIf.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {rejectIf.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200">
                      <span className="text-xs text-amber-900 flex-1">
                        Se disser <strong>"{r.pattern}"</strong> {r.hint ? <em className="text-amber-700">→ {r.hint}</em> : <em className="text-amber-700">→ pede mais detalhe</em>}
                      </span>
                      <button onClick={() => removeRejection(i)} className="text-amber-600 hover:text-rose-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  value={newRejPattern}
                  onChange={(e) => setNewRejPattern(e.target.value)}
                  placeholder='Padrão (ex: "no fim do ano")'
                  className="col-span-5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs"
                />
                <input
                  value={newRejHint}
                  onChange={(e) => setNewRejHint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addRejection()
                    }
                  }}
                  placeholder='Reação (ex: "peça mês específico")'
                  className="col-span-5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs"
                />
                <Button size="sm" variant="outline" onClick={addRejection} className="col-span-2 gap-1">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {generatedPreview && (
              <div className="border-t border-emerald-200 pt-2.5">
                <label className="block text-[11px] font-medium text-emerald-900 mb-1">
                  👁 Pergunta sugerida (gerada automaticamente)
                </label>
                <div className="text-xs text-emerald-900 italic px-3 py-2 rounded-md bg-white border border-emerald-100">
                  "{generatedPreview}"
                </div>
                <p className="text-[10px] text-emerald-800 mt-1">
                  Se você quiser texto fixo, cadastre em "Perguntas escritas" abaixo. Senão a agente improvisa cobrindo os itens acima.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowLegacyCoverage(!showLegacyCoverage)}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 underline pt-1"
            >
              {showLegacyCoverage ? 'Esconder modo legado (texto livre)' : 'Modo legado (texto livre — não recomendado)'}
            </button>

            {showLegacyCoverage && (
              <div className="border-t border-emerald-200 pt-2.5">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Notas em texto livre <span className="text-slate-400 font-normal">(legado, ~80% obediência)</span>
                </label>
                <textarea
                  value={slot.coverage_notes ?? ''}
                  onChange={(e) => onChange({ coverage_notes: e.target.value || null })}
                  placeholder='Ex: precisa de mês E ano. Não aceita "no fim do ano".'
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed resize-y"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Só usado quando a lista "Dados que a resposta DEVE coletar" está vazia. Migre pro estruturado quando puder.
                </p>
                <LeakWarningsList text={slot.coverage_notes ?? ''} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Perguntas escritas <span className="text-slate-400 font-normal">(opcional — vazio = agente improvisa)</span>
            </label>
            {slot.questions.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {slot.questions.map((q, i) => (
                  <div key={i} className="rounded-md bg-slate-50 border border-slate-100">
                    <div className="flex items-start gap-2 px-2.5 py-1.5">
                      <span className="text-xs text-slate-400 mt-0.5">{i + 1}.</span>
                      <span className="flex-1 text-xs text-slate-700">{q}</span>
                      <button
                        type="button"
                        onClick={() => removeQuestion(i)}
                        className="text-slate-400 hover:text-rose-600"
                        title="Remover pergunta"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <LeakWarningsList text={q} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addQuestion()
                  }
                }}
                placeholder="Ex: Vocês já têm uma data ou época em mente?"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              />
              <Button size="sm" variant="outline" onClick={addQuestion} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <LeakWarningsList text={newQuestion} />
          </div>

          <SlotV2Section slot={slot} onChange={onChange} />

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <Button size="sm" variant="outline" onClick={onRemove} className="gap-1.5 text-slate-500 hover:text-rose-600">
              <X className="w-3.5 h-3.5" /> Remover esta informação
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Seção Schema V2 — campos novos (goal/must_include/example_questions/literal_question).
 * Aparece em todos slots da Estela (V1). Quando feature_flag_discovery_v2=true no banco,
 * a edge function usa esses campos em vez de coverage_notes/questions.
 * Inclui validação client-side rigorosa e preview "antes vs depois" integrado.
 */
function SlotV2Section({
  slot,
  onChange,
}: {
  slot: DiscoverySlot
  onChange: (next: Partial<DiscoverySlot>) => void
}) {
  const [open, setOpen] = useState(!!slot.goal)
  const [newInclude, setNewInclude] = useState('')
  const [newExample, setNewExample] = useState('')

  const goalRaw = slot.goal ?? ''
  const goalTrim = goalRaw.trim()
  const goalError =
    goalTrim.length > 0 && goalTrim.length < 10
      ? 'Goal precisa ter pelo menos 10 caracteres'
      : goalTrim.length > 300
      ? `Goal muito longo (${goalTrim.length}/300 chars)`
      : goalTrim.endsWith('?')
      ? "Goal é objetivo, não pergunta. Use 'Descobrir se...' ou 'Saber qual...'"
      : null

  const literalActive = !!(slot.literal_question ?? '').trim()

  const addMustInclude = () => {
    const item = newInclude.trim()
    if (!item) return
    // Rejeita frases imperativas tipo "Saber se viajou..." que causariam o bug
    // legado se a flag estivesse OFF. Phrase atômica/objeto-direto passa livre.
    if (/^\s*(saber|verificar|entender|confirmar|descobrir|checar)\s+(se|qual|quanto|quando|como|onde)\b/i.test(item)) {
      alert(
        "Use o objeto que a pergunta precisa coletar, não a meta-instrução. " +
        "Ex: 'viagem internacional fora da América do Sul' em vez de 'Saber se viajou internacionalmente'. " +
        "Se quer dar contexto pra IA, use o campo Goal acima."
      )
      return
    }
    onChange({ must_include: [...(slot.must_include ?? []), item] })
    setNewInclude('')
  }

  const removeMustInclude = (i: number) => {
    onChange({ must_include: (slot.must_include ?? []).filter((_, j) => j !== i) })
  }

  const addExample = () => {
    const q = newExample.trim()
    if (!q) return
    if (q.length > 200) {
      alert('Máximo 200 caracteres por exemplo.')
      return
    }
    const current = slot.example_questions ?? []
    if (current.length >= 3) {
      alert('Máximo 3 exemplos por slot.')
      return
    }
    onChange({ example_questions: [...current, q] })
    setNewExample('')
  }

  const removeExample = (i: number) => {
    onChange({ example_questions: (slot.example_questions ?? []).filter((_, j) => j !== i) })
  }

  const slotV2: SlotV2 = {
    key: slot.key,
    label: slot.label,
    icon: slot.icon ?? undefined,
    priority: slot.priority,
    required: slot.required,
    crm_field_key: slot.crm_field_key ?? null,
    goal: slot.goal ?? null,
    must_include: slot.must_include ?? [],
    example_questions: slot.example_questions ?? [],
    literal_question: slot.literal_question ?? null,
    must_collect: slot.must_collect,
    questions: slot.questions ?? [],
    coverage_notes: slot.coverage_notes,
    reject_if: slot.reject_if,
  }

  const preview = slotV2.goal && slotV2.goal.trim()
    ? renderSlotForPrompt(slotV2)
    : renderSlotLegacyForPreview(slotV2)

  return (
    <div className="pt-2 border-t border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 transition"
      >
        <Wand2 className="w-3.5 h-3.5" />
        Schema novo (V2) — Estela
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
        Quando a flag <code>feature_flag_discovery_v2</code> está ON, a Estela usa esses 4 campos em vez de Coverage Notes/Perguntas escritas.
        Hierarquia: Pergunta literal &gt; Elementos obrigatórios &gt; Exemplos de pergunta &gt; Goal puro.
      </p>

      {open && (
        <div className="mt-3 space-y-3 p-3 rounded-lg bg-indigo-50/40 border border-indigo-200">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Objetivo (Goal) <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={goalRaw}
              onChange={(e) => onChange({ goal: e.target.value || null })}
              placeholder="O que você quer descobrir nesse item? Ex: Descobrir o mês e ano do casamento"
              rows={2}
              maxLength={300}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y',
                goalError ? 'border-rose-400' : 'border-slate-300',
              )}
            />
            <div className="flex items-center justify-between mt-1">
              <span className={cn('text-[10px]', goalError ? 'text-rose-600' : 'text-slate-400')}>
                {goalError ?? 'Texto livre. A Estela usa pra entender o que coletar.'}
              </span>
              <span className="text-[10px] text-slate-400">{goalTrim.length}/300</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Elementos obrigatórios <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Dados/conceitos que a pergunta DEVE coletar. Ex: <code>mês</code>, <code>ano</code>, <code>viagem internacional fora da América do Sul</code>. Pode ser longo se for o objeto específico — só não vire frase descritiva ("Saber se...").
            </p>
            {(slot.must_include ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(slot.must_include ?? []).map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 rounded-md px-2 py-0.5 text-[11px] font-medium"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => removeMustInclude(i)}
                      className="hover:text-indigo-950"
                      aria-label="Remover item"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newInclude}
                onChange={(e) => setNewInclude(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMustInclude()
                  }
                }}
                placeholder="Ex: mês"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <Button size="sm" variant="outline" onClick={addMustInclude} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Exemplos de pergunta <span className="text-slate-400 font-normal">(opcional, máx 3)</span>
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              1 a 3 exemplos de TOM. A Estela NÃO copia literal — usa como referência de voz.
            </p>
            {(slot.example_questions ?? []).map((q, i) => (
              <div key={i} className="flex items-start gap-2 mb-1.5">
                <input
                  value={q}
                  onChange={(e) =>
                    onChange({
                      example_questions: (slot.example_questions ?? []).map((v, j) =>
                        j === i ? e.target.value : v,
                      ),
                    })
                  }
                  maxLength={200}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeExample(i)}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label="Remover exemplo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {(slot.example_questions ?? []).length < 3 && (
              <div className="flex gap-2">
                <input
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addExample()
                    }
                  }}
                  placeholder={`Ex: E sobre a data, vocês já têm em mente? (${(slot.example_questions ?? []).length}/3)`}
                  maxLength={200}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
                <Button size="sm" variant="outline" onClick={addExample} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Pergunta literal (override) <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Se preenchida, a Estela usa EXATAMENTE essa pergunta. Reserve pra slots cirúrgicos.
            </p>
            <input
              value={slot.literal_question ?? ''}
              onChange={(e) => onChange({ literal_question: e.target.value || null })}
              placeholder="(opcional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
            {literalActive && (
              <p className="text-[10px] text-amber-700 mt-1">
                ⚠ Quando preenchido, esse texto domina. Elementos obrigatórios e exemplos são ignorados.
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-indigo-200">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 mb-1.5">
              Preview do que vai pro prompt
            </div>
            <pre className="bg-white border border-slate-200 rounded-md p-2.5 text-[11px] font-mono whitespace-pre-wrap text-slate-900 max-h-48 overflow-y-auto leading-relaxed">
              {preview ?? '(slot ainda sem goal preenchido — usaria schema legado)'}
            </pre>
            <p className="text-[10px] text-slate-500 mt-1">
              Esse é o bloco que a Estela vai receber pra esse slot quando a flag estiver ON.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Mostra warnings inline detectados pelo leakDetector. Renderizado abaixo de
 * cada pergunta cadastrada e do input de nova pergunta. Não bloqueia save —
 * só sinaliza pro admin enxergar antes de salvar.
 *
 * Memoiza por texto pra evitar re-roda regex toda render.
 */
function LeakWarningsList({ text }: { text: string }) {
  const warnings: LeakWarning[] = useMemo(() => detectLeaks(text), [text])
  if (warnings.length === 0) return null
  return (
    <div className="mt-1.5 space-y-1">
      {warnings.map((w, i) => {
        const colorClass =
          w.severity === 'high'
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : w.severity === 'medium'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-slate-50 text-slate-700'
        const iconClass =
          w.severity === 'high'
            ? 'text-rose-600'
            : w.severity === 'medium'
              ? 'text-amber-600'
              : 'text-slate-500'
        return (
          <div key={i} className={cn('flex items-start gap-1.5 px-2 py-1.5 rounded-md border text-[10px] leading-relaxed', colorClass)}>
            <AlertTriangle className={cn('w-3 h-3 mt-0.5 shrink-0', iconClass)} />
            <div className="flex-1 min-w-0">
              <div>
                <strong>"{w.match}"</strong> — {w.reason}
              </div>
              {w.suggestion && (
                <div className="mt-0.5 italic opacity-80">💡 {w.suggestion}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
