import { useState } from 'react'
import { Brain, Database, ImageIcon, ShieldAlert, ChevronDown, ChevronRight, Info, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabModelosComportamento } from '../../../TabModelosComportamento'
import { TabMemoria } from '../../../TabMemoria'
import { TabMultimodal } from '../../../TabMultimodal'
import { TabValidatorRules } from '../../../TabValidatorRules'
import type { AgentEditorForm } from '../../../types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  isN8n: boolean
}

// Card "contexto" (Campos do CRM) removido: engine V2 ignora completamente
// context_fields_config — apenas selecionado no SELECT, nunca lido em prompt
// ou condicional. Quem controla campos atualizáveis é
// ai_agent_business_config.auto_update_fields (aba Regras de negócio).
type CardKey = 'modelos' | 'memoria' | 'multimodal' | 'validador'

const CARDS: Array<{
  key: CardKey
  title: string
  subtitle: string
  icon: typeof Brain
  iconBg: string
  iconText: string
  n8nDisabled: boolean
}> = [
  // Cores escolhidas com semântica:
  // - Pipeline IA: violet (cérebro/IA)
  // - Memória: indigo (mesma família — armazenamento de pensamento)
  // - Multimodal: sky (mídia/visual)
  // - Validador: amber (regra/atenção)
  { key: 'modelos',    title: 'Pipeline de IA',  subtitle: 'Modelos que rodam em cada etapa do turno (resposta, validação, formatador)', icon: Brain,       iconBg: 'bg-violet-50',  iconText: 'text-violet-600',  n8nDisabled: true },
  { key: 'memoria',    title: 'Memória',          subtitle: 'Quantos turnos de histórico ela carrega no contexto',                          icon: Database,    iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600',  n8nDisabled: true },
  { key: 'multimodal', title: 'Multimodal',       subtitle: 'Áudio, imagem e PDF — quais mídias ela entende',                              icon: ImageIcon,   iconBg: 'bg-sky-50',     iconText: 'text-sky-600',     n8nDisabled: true },
  { key: 'validador',  title: 'Validador',        subtitle: 'Regras pós-produção que corrigem ou bloqueiam respostas',                     icon: ShieldAlert, iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   n8nDisabled: true },
]

/**
 * Área "Técnico" da redesign UI v3 — Fase 5.
 *
 * Funde 5 abas separadas em uma vista única com cards colapsáveis.
 * Configurações que raramente mudam mas precisam ficar acessíveis.
 *
 * IMPORTANTE: cada componente filho (TabModelosComportamento, TabMemoria,
 * etc) renderiza seu próprio <section> com border/header. Pra evitar dupla
 * caixa, NÃO envelopamos cada card num section próprio — só o trigger
 * (header colapsável) é nosso. O conteúdo expandido renderiza o componente
 * filho direto, que cuida do próprio enquadramento visual.
 */
export function TecnicoSection({ form, setForm, isN8n }: Props) {
  const [expanded, setExpanded] = useState<Record<CardKey, boolean>>({
    modelos: false,
    memoria: false,
    multimodal: false,
    validador: false,
  })

  const toggle = (k: CardKey) => setExpanded(s => ({ ...s, [k]: !s[k] }))

  const allDisabled = isN8n && CARDS.every(c => c.n8nDisabled)

  return (
    <div className="space-y-5">
      {/* Banner explicativo */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex gap-3">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-0.5">
            Configurações técnicas
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Modelos de IA, memória, multimodal e validador. Os valores padrão atendem
            a maioria dos casos — você raramente precisa mexer aqui.
          </p>
        </div>
      </div>

      {allDisabled && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 flex gap-3">
          <Info className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700">
            <strong>Este agente roda em n8n.</strong> Configurações técnicas (modelos, memória,
            multimodal, validador) moram no workflow do n8n, não aqui.
          </div>
        </div>
      )}

      {/* Cards colapsáveis */}
      <div className="space-y-2">
        {CARDS.map(card => {
          const Icon = card.icon
          const disabled = isN8n && card.n8nDisabled
          const isOpen = expanded[card.key]

          return (
            <div key={card.key}>
              {/* Header: card colapsável só com trigger (não envolve o conteúdo
                  pra evitar dupla caixa com o section interno do componente filho) */}
              <button
                type="button"
                onClick={() => !disabled && toggle(card.key)}
                disabled={disabled}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm transition-all text-left',
                  disabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-slate-300 hover:shadow-md',
                  isOpen && !disabled && 'border-indigo-200 shadow-md',
                )}
              >
                <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', card.iconBg)}>
                  <Icon className={cn('w-4 h-4', card.iconText)} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                    {disabled && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-medium inline-flex items-center gap-1">
                        <ExternalLink className="w-2.5 h-2.5" />
                        no n8n
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{card.subtitle}</p>
                </div>
                {!disabled && (
                  <span className={cn('flex-shrink-0 transition-colors', isOpen ? 'text-indigo-600' : 'text-slate-400')}>
                    {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </span>
                )}
              </button>

              {/* Conteúdo expandido — renderiza o componente filho direto.
                  Cada componente já tem seu próprio <section> com border/header,
                  então não envelopamos. */}
              {isOpen && !disabled && (
                <div className="mt-2">
                  {card.key === 'modelos'    && <TabModelosComportamento form={form} setForm={setForm} />}
                  {card.key === 'memoria'    && <TabMemoria form={form} setForm={setForm} />}
                  {card.key === 'multimodal' && <TabMultimodal form={form} setForm={setForm} />}
                  {card.key === 'validador'  && <TabValidatorRules form={form} setForm={setForm} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
