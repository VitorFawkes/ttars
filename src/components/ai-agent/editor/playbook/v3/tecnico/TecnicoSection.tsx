import { useState } from 'react'
import { Brain, Database, ImageIcon, Radio, ShieldAlert, Settings2, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabModelosComportamento } from '../../../TabModelosComportamento'
import { TabMemoria } from '../../../TabMemoria'
import { TabMultimodal } from '../../../TabMultimodal'
import { TabValidatorRules } from '../../../TabValidatorRules'
import { TabContextoCampos } from '../../../TabContextoCampos'
import type { AgentEditorForm } from '../../../types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
  isN8n: boolean
}

type CardKey = 'modelos' | 'memoria' | 'multimodal' | 'validador' | 'contexto'

const CARDS: Array<{
  key: CardKey
  title: string
  subtitle: string
  icon: typeof Brain
  iconColor: string
  n8nDisabled: boolean
}> = [
  { key: 'modelos',    title: 'Pipeline de IA', subtitle: 'Quais modelos rodam em cada etapa do turno (resposta, validação, formatador)', icon: Brain,       iconColor: 'text-violet-600', n8nDisabled: true },
  { key: 'memoria',    title: 'Memória',         subtitle: 'Quantos turnos de histórico ela carrega no contexto',                          icon: Database,    iconColor: 'text-amber-600',  n8nDisabled: true },
  { key: 'contexto',   title: 'Campos do CRM',   subtitle: 'Quais campos ela vê do card e quais pode atualizar',                          icon: Radio,       iconColor: 'text-cyan-600',   n8nDisabled: false },
  { key: 'multimodal', title: 'Multimodal',      subtitle: 'Áudio, imagem e PDF — quais mídias ela entende',                              icon: ImageIcon,   iconColor: 'text-pink-600',   n8nDisabled: true },
  { key: 'validador',  title: 'Validador',       subtitle: 'Regras pós-produção que corrigem ou bloqueiam respostas',                     icon: ShieldAlert, iconColor: 'text-orange-600', n8nDisabled: true },
]

/**
 * Área "Técnico" da redesign UI v3 — Fase 5.
 *
 * Funde 5 abas separadas (Modelos, Memória, Multimodal, Validador, Campos)
 * em uma única vista com cards colapsáveis. São configurações que raramente
 * mudam mas precisam ficar acessíveis quando precisar.
 *
 * Reusa 100% dos componentes existentes (TabModelosComportamento,
 * TabMemoria, TabMultimodal, TabValidatorRules, TabContextoCampos).
 *
 * Quando o agente roda em n8n, alguns cards ficam visualmente desabilitados
 * pra deixar claro que aquela configuração mora no workflow do n8n.
 */
export function TecnicoSection({ form, setForm, agentId, isN8n }: Props) {
  const [expanded, setExpanded] = useState<Record<CardKey, boolean>>({
    modelos: false,
    memoria: false,
    multimodal: false,
    validador: false,
    contexto: false,
  })

  const toggle = (k: CardKey) => setExpanded(s => ({ ...s, [k]: !s[k] }))

  return (
    <div className="space-y-5">
      {/* Banner explicativo */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 flex gap-3">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-0.5">
            Configurações técnicas — você raramente mexe aqui
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Modelos de IA, memória, multimodal, validador e campos do CRM. Os valores padrão funcionam
            pra maioria dos casos. Mexa só se entender o que tá fazendo ou se um problema específico pedir.
          </p>
        </div>
      </div>

      {/* Cards colapsáveis */}
      <div className="space-y-2">
        {CARDS.map(card => {
          const Icon = card.icon
          const disabled = isN8n && card.n8nDisabled
          const isOpen = expanded[card.key]

          return (
            <div key={card.key} className={cn(
              'border rounded-xl overflow-hidden bg-white shadow-sm transition-colors',
              disabled ? 'border-slate-200 opacity-60' : 'border-slate-200',
            )}>
              <button
                type="button"
                onClick={() => !disabled && toggle(card.key)}
                disabled={disabled}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
                  disabled ? 'cursor-not-allowed' : 'hover:bg-slate-50',
                )}
              >
                <span className={cn('w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0', card.iconColor)}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{card.title}</h3>
                    {disabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 font-medium">
                        no n8n
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{card.subtitle}</p>
                </div>
                {!disabled && (
                  isOpen
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {isOpen && !disabled && (
                <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/30">
                  {card.key === 'modelos'    && <TabModelosComportamento form={form} setForm={setForm} />}
                  {card.key === 'memoria'    && <TabMemoria form={form} setForm={setForm} />}
                  {card.key === 'multimodal' && <TabMultimodal form={form} setForm={setForm} />}
                  {card.key === 'validador'  && <TabValidatorRules form={form} setForm={setForm} />}
                  {card.key === 'contexto'   && <TabContextoCampos form={form} setForm={setForm} agentId={agentId} />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tempos & ritmo (parte do TabModelosComportamento, mas exposta visualmente como bloco separado seria duplicar lógica) */}
      <div className="rounded-xl border border-dashed border-slate-200 p-4">
        <div className="flex gap-3">
          <Settings2 className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-0.5">Tempo e ritmo</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Debounce, atraso de digitação simulado e máximo de blocos por resposta vivem dentro de
              <strong> Pipeline de IA</strong> acima. Será movido pra um card próprio numa próxima iteração.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
