import { useMemo } from 'react'
import {
  Lightbulb, Info, ChevronDown, ChevronRight,
  UserPlus, Tag as TagIcon, FileText, Calendar, MessageCircle,
  Sparkles, BookOpen, RefreshCw, Network,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { INTELLIGENT_DECISIONS_CATALOG, type AgentEditorForm } from './types'
import { cn } from '@/lib/utils'
import { FieldAwareTextarea } from './FieldAwareTextarea'
import { useAiAgentDetail } from '@/hooks/v2/useAiAgents'
import { useProducts } from '@/hooks/useProducts'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
}

// Categorização semântica das decisões. Cada categoria tem cor + ícone próprios
// pra dar hierarquia visual no editor (era lista flat sem agrupamento antes).
type CategoryKey = 'crm' | 'calendario' | 'tom' | 'conhecimento' | 'avancado'

interface CategoryDef {
  key: CategoryKey
  label: string
  description: string
  color: 'emerald' | 'sky' | 'pink' | 'amber' | 'slate'
}

const CATEGORIES: CategoryDef[] = [
  { key: 'crm',          label: 'Atualização de dados',  description: 'Quando ela atualiza o CRM com info da conversa',   color: 'emerald' },
  { key: 'calendario',   label: 'Calendário & contexto', description: 'Quando ela age no fluxo da conversa',              color: 'sky' },
  { key: 'tom',          label: 'Tom & estilo',          description: 'Como ela se adapta ao cliente',                    color: 'pink' },
  { key: 'conhecimento', label: 'Conhecimento',          description: 'Quando ela busca informação verificada',           color: 'amber' },
  { key: 'avancado',     label: 'Avançado',              description: 'Encaminhamento entre agentes',                     color: 'slate' },
]

// Mapeia cada decision key pra categoria + ícone
const DECISION_META: Record<string, { category: CategoryKey; icon: typeof UserPlus }> = {
  atualizar_contato:   { category: 'crm',          icon: UserPlus },
  aplicar_tag:         { category: 'crm',          icon: TagIcon },
  consolidar_resumo:   { category: 'crm',          icon: FileText },
  criar_reuniao:       { category: 'calendario',   icon: Calendar },
  pedir_contexto:      { category: 'calendario',   icon: MessageCircle },
  ajuste_tom:          { category: 'tom',          icon: Sparkles },
  reapresentacao:      { category: 'tom',          icon: RefreshCw },
  buscar_kb:           { category: 'conhecimento', icon: BookOpen },
  escalar_agente_ia:   { category: 'avancado',     icon: Network },
}

const COLOR_CLASSES: Record<CategoryDef['color'], {
  border: string
  bg: string
  iconBg: string
  iconText: string
  pillBg: string
}> = {
  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50/40',  iconBg: 'bg-emerald-100', iconText: 'text-emerald-700', pillBg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  sky:     { border: 'border-sky-200',     bg: 'bg-sky-50/40',      iconBg: 'bg-sky-100',     iconText: 'text-sky-700',     pillBg: 'bg-sky-100 text-sky-800 border-sky-200' },
  pink:    { border: 'border-pink-200',    bg: 'bg-pink-50/40',     iconBg: 'bg-pink-100',    iconText: 'text-pink-700',    pillBg: 'bg-pink-100 text-pink-800 border-pink-200' },
  amber:   { border: 'border-amber-200',   bg: 'bg-amber-50/40',    iconBg: 'bg-amber-100',   iconText: 'text-amber-700',   pillBg: 'bg-amber-100 text-amber-800 border-amber-200' },
  slate:   { border: 'border-slate-200',   bg: 'bg-slate-50/40',    iconBg: 'bg-slate-100',   iconText: 'text-slate-700',   pillBg: 'bg-slate-100 text-slate-700 border-slate-300' },
}

export function TabDecisoes({ form, setForm, agentId }: Props) {
  const { data: agent } = useAiAgentDetail(agentId)
  const { products } = useProducts()
  const produto = (agent as { produto?: string } | undefined)?.produto
  const pipelineId = products.find(p => p.slug === produto)?.pipeline_id ?? undefined

  const toggle = (key: string) => {
    setForm(f => {
      const current = f.intelligent_decisions[key] ?? { enabled: false, config: {} }
      return {
        ...f,
        intelligent_decisions: {
          ...f.intelligent_decisions,
          [key]: { ...current, enabled: !current.enabled },
        },
      }
    })
  }

  const updateInstructions = (key: string, instructions: string) => {
    setForm(f => {
      const current = f.intelligent_decisions[key] ?? { enabled: true, config: {} }
      return {
        ...f,
        intelligent_decisions: {
          ...f.intelligent_decisions,
          [key]: {
            ...current,
            config: { ...current.config, instructions },
          },
        },
      }
    })
  }

  // Agrupa decisões por categoria
  const grouped = useMemo(() => {
    const map = new Map<CategoryKey, typeof INTELLIGENT_DECISIONS_CATALOG>()
    for (const d of INTELLIGENT_DECISIONS_CATALOG) {
      const cat = DECISION_META[d.key]?.category ?? 'avancado'
      const arr = map.get(cat) ?? []
      arr.push(d)
      map.set(cat, arr)
    }
    return CATEGORIES.map(c => ({ category: c, decisions: map.get(c.key) ?? [] })).filter(g => g.decisions.length > 0)
  }, [])

  const totalEnabled = INTELLIGENT_DECISIONS_CATALOG.filter(
    d => form.intelligent_decisions[d.key]?.enabled
  ).length

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            Decisões inteligentes
          </h2>
          <span className="text-xs text-slate-500 font-normal">
            ({totalEnabled} de {INTELLIGENT_DECISIONS_CATALOG.length} ativas)
          </span>
        </div>
      </header>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 flex gap-2.5">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <strong>Decisões dizem QUANDO ela age</strong> (ex: "quando criar reunião"). Cada decisão
          ligada vira instrução pro agente. Diferente de <strong>Ferramentas</strong>, que são as
          ações técnicas que ela chama (API, função, etc).
        </div>
      </div>

      {/* Grupos por categoria */}
      <div className="space-y-6">
        {grouped.map(({ category, decisions }) => {
          const colors = COLOR_CLASSES[category.color]
          const enabledInCategory = decisions.filter(d => form.intelligent_decisions[d.key]?.enabled).length

          return (
            <CategoryGroup
              key={category.key}
              label={category.label}
              description={category.description}
              colors={colors}
              enabledCount={enabledInCategory}
              totalCount={decisions.length}
            >
              {decisions.map(cat => {
                const decision = form.intelligent_decisions[cat.key] ?? { enabled: false, config: {} }
                const instructions = (decision.config.instructions as string) || ''
                const meta = DECISION_META[cat.key]
                const Icon = meta?.icon ?? Lightbulb
                return (
                  <DecisionCard
                    key={cat.key}
                    label={cat.label}
                    description={cat.description}
                    Icon={Icon}
                    colors={colors}
                    enabled={decision.enabled}
                    onToggle={() => toggle(cat.key)}
                    instructions={instructions}
                    onChangeInstructions={(v) => updateInstructions(cat.key, v)}
                    pipelineId={pipelineId}
                    produto={produto}
                    agentId={agentId}
                  />
                )
              })}
            </CategoryGroup>
          )
        })}
      </div>
    </section>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function CategoryGroup({
  label, description, colors, enabledCount, totalCount, children,
}: {
  label: string
  description: string
  colors: typeof COLOR_CLASSES[CategoryDef['color']]
  enabledCount: number
  totalCount: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{label}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0',
          enabledCount > 0 ? colors.pillBg : 'bg-slate-50 text-slate-500 border-slate-200',
        )}>
          {enabledCount}/{totalCount} ativas
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DecisionCard({
  label, description, Icon, colors, enabled, onToggle,
  instructions, onChangeInstructions,
  pipelineId, produto, agentId,
}: {
  label: string
  description: string
  Icon: typeof UserPlus
  colors: typeof COLOR_CLASSES[CategoryDef['color']]
  enabled: boolean
  onToggle: () => void
  instructions: string
  onChangeInstructions: (v: string) => void
  pipelineId?: string
  produto?: string
  agentId?: string
}) {
  return (
    <div className={cn(
      'border rounded-xl transition-all',
      enabled ? `${colors.border} ${colors.bg} shadow-sm` : 'border-slate-200 bg-white',
    )}>
      <div className="p-3 flex items-start gap-3">
        <span className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
          enabled ? `${colors.iconBg} ${colors.iconText}` : 'bg-slate-100 text-slate-400',
        )}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <Switch
          aria-label={`Ligar/desligar: ${label}`}
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>

      {enabled && (
        <div className="border-t border-slate-200/60 px-3 pb-3 pt-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ChevronDown className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] font-medium text-slate-600">
              Instruções específicas (opcional)
            </span>
          </div>
          <FieldAwareTextarea
            value={instructions}
            onChange={onChangeInstructions}
            rows={2}
            pipelineId={pipelineId}
            produto={produto}
            agentId={agentId}
            enabledTypes={['field', 'tag', 'skill', 'stage']}
            placeholder={`Ex: ${getPlaceholder(label)}`}
          />
          <p className="text-[10px] text-slate-400 mt-1.5">
            Escreva em linguagem natural. Digite <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[9px]">@</kbd> pra
            inserir campo, tag, skill ou etapa.
          </p>
        </div>
      )}

      {!enabled && (
        <button
          type="button"
          onClick={onToggle}
          className="border-t border-slate-200/60 px-3 py-2 w-full text-left text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50/50 inline-flex items-center gap-1.5 transition-colors rounded-b-xl"
        >
          <ChevronRight className="w-3 h-3" />
          Ligar pra adicionar instruções específicas
        </button>
      )}
    </div>
  )
}

/** Placeholder contextual — sugestão prática por tipo de decisão. */
function getPlaceholder(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('reunião')) return 'Só criar depois do cliente confirmar e-mail. Nunca antes das 9h ou depois das 18h.'
  if (lower.includes('contato')) return 'Atualizar nome só se aparecer com sobrenome explícito. Nunca atualizar telefone.'
  if (lower.includes('tag')) return 'Aplicar "Quente" só quando o cliente pedir reunião explicitamente.'
  if (lower.includes('contexto')) return 'Se faltar destino e data, pedir antes de seguir. Se for só objeção, responder direto.'
  if (lower.includes('tom')) return 'Se cliente parecer apressado, encurtar respostas. Se relaxado, manter ritmo.'
  if (lower.includes('resumo')) return 'Atualizar quando aparecer destino, data ou orçamento. Não mexer em outras conversas.'
  if (lower.includes('apresenta')) return 'Re-apresentar se passou mais de 7 dias desde última msg.'
  if (lower.includes('escalar')) return 'Encaminhar pra outro agente IA quando o tema for fora do escopo dela.'
  if (lower.includes('knowledge') || lower.includes('kb')) return 'Buscar antes de responder qualquer pergunta sobre prazo, processo ou destino.'
  return 'Adicione regras específicas em linguagem natural.'
}
