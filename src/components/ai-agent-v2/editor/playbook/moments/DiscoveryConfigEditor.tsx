import { useState } from 'react'
import { Plus, X, ChevronDown, ChevronRight, ShieldAlert, Zap, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { SingleFieldPicker } from '@/components/ai-agent-v2/editor/CRMFieldPicker'
import { resolveSlotPriority, type DiscoveryConfig, type DiscoverySlot, type SlotPriority } from '@/hooks/v2/playbook/useAgentMoments'
import { renderSlotForPrompt, renderSlotLegacyForPreview, type SlotV2 } from '@/lib/slotRenderer'

/** Engine do agente (vem de ai_agents.engine). */
export type AgentEngineVersion = 'v1' | 'v2'

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
  /**
   * Engine do agente. 'v1' (multi_agent_pipeline, ex: Estela) habilita seção
   * Schema V2 com goal/must_include/example_questions/literal_question.
   * 'v2' (single_agent_v2, ex: Patricia) mantém UI atual sem campos novos.
   * Default 'v2' por segurança — não mostra UI nova até admin explicitar.
   */
  engineVersion?: AgentEngineVersion
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
export function DiscoveryConfigEditor({ value, onChange, pipelineId, produtoSlug, engineVersion = 'v2' }: Props) {
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
                engineVersion={engineVersion}
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
  engineVersion,
}: {
  slot: DiscoverySlot
  onChange: (next: Partial<DiscoverySlot>) => void
  onRemove: () => void
  pipelineId?: string
  produtoSlug?: string
  engineVersion?: AgentEngineVersion
}) {
  const [expanded, setExpanded] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')

  const addQuestion = () => {
    const q = newQuestion.trim()
    if (!q) return
    onChange({ questions: [...slot.questions, q] })
    setNewQuestion('')
  }

  const removeQuestion = (i: number) => {
    onChange({ questions: slot.questions.filter((_, j) => j !== i) })
  }

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

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              O que essa pergunta precisa cobrir <span className="text-slate-400 font-normal">(opcional — guia pra IA improvisar)</span>
            </label>
            <textarea
              value={slot.coverage_notes ?? ''}
              onChange={(e) => onChange({ coverage_notes: e.target.value || null })}
              placeholder='Ex: precisa de mês E ano. Não aceita "no fim do ano" — confirme mês específico. Se cliente disser só "janeiro", pergunte qual ano.'
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Use isso pra explicar pro agente o que essa pergunta precisa contemplar — formato, edge cases, clarificações exigidas. Vale tanto pra perguntas escritas quanto pra improvisação.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Perguntas escritas <span className="text-slate-400 font-normal">(opcional — vazio = agente improvisa)</span>
            </label>
            {slot.questions.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {slot.questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-100">
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
          </div>

          {engineVersion === 'v1' && <SlotV2Section slot={slot} onChange={onChange} />}

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
 * Seção Schema V2 — campos novos (goal/must_include/example_questions/literal_question)
 * Aparece apenas para agentes em engine V1 (Estela). Patricia continua só com schema legado.
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
    // Rejeita strings com preposição+verbo (heurística contra frases descritivas)
    if (/\b(de|em|para|com|por|a|o|dos|das)\s+\w+\s+(se|vai|tem|tá|está|ser|ter|fazer)\b/i.test(item)) {
      alert(
        "Use conceitos atômicos (1-3 palavras): 'mês', 'ano', 'número de convidados'. " +
        "Você escreveu uma descrição — passe pra Goal ou Exemplos de pergunta."
      )
      return
    }
    if (item.split(/\s+/).length > 4) {
      alert('Máximo 4 palavras por item de must_include.')
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
      alert('Máximo 3 exemplos por slot. Limite serve pra evitar que o LLM copie um exemplo literalmente.')
      return
    }
    onChange({ example_questions: [...current, q] })
    setNewExample('')
  }

  const removeExample = (i: number) => {
    onChange({ example_questions: (slot.example_questions ?? []).filter((_, j) => j !== i) })
  }

  // Slot V2 visto pelo renderSlotForPrompt — adaptar pra contrato esperado
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
    must_collect: undefined,
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
          {/* Goal */}
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

          {/* must_include */}
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Elementos obrigatórios <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Itens atômicos que a pergunta DEVE cobrir. Ex: <code>mês</code>, <code>ano</code>, <code>número de convidados</code>. Não escreva frases descritivas.
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

          {/* example_questions */}
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

          {/* literal_question */}
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Pergunta literal (override) <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Se preenchida, a Estela usa EXATAMENTE essa pergunta. Reserve pra slots cirúrgicos (confirmação de agenda com link, frases compliance).
            </p>
            <input
              value={slot.literal_question ?? ''}
              onChange={(e) => onChange({ literal_question: e.target.value || null })}
              placeholder="(opcional) — quando preenchido, sobrescreve elementos obrigatórios e exemplos"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
            {literalActive && (
              <p className="text-[10px] text-amber-700 mt-1">
                ⚠ Quando preenchido, esse texto domina. Elementos obrigatórios e exemplos são ignorados.
              </p>
            )}
          </div>

          {/* Preview "antes vs depois" — Task 16 integrada */}
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
