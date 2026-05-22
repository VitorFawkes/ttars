import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, UserCircle, MessagesSquare, Brain, MessageSquareQuote } from 'lucide-react'
import { ExamplesSection } from './sections/ExamplesSection'
import { CognitiveAuditSection } from './sections/CognitiveAuditSection'
import { V1V2ComparisonCard } from './V1V2ComparisonCard'
import { QuemElaESection } from './v3/quem-ela-e/QuemElaESection'
import { ComoConversaSection } from './v3/como-conversa/ComoConversaSection'

interface Props {
  agentId: string
  agentName: string
  companyName: string
  /** Slug do produto do agente (WEDDING, TRIPS...). Propagado pra editores
   *  que precisam do catálogo de variáveis CRM correto. */
  produto?: string | null
}

type SectionKey =
  | 'quem_ela_e'        // identidade + voz + linhas vermelhas
  | 'como_ela_conversa' // momentos + sondagem + pontuação + conhecimento
  | 'cerebro_analitico' // o que o agente roda mentalmente por turno
  | 'examples'          // few-shot

const SECTION_DEF: Record<SectionKey, { title: string; subtitle: string; icon: typeof UserCircle }> = {
  quem_ela_e:        { title: 'Quem ela é', subtitle: 'Identidade, voz e linhas vermelhas — tudo que define a personalidade', icon: UserCircle },
  como_ela_conversa: { title: 'Como ela conversa', subtitle: 'Roteiro, sondagem, pontuação e conhecimento', icon: MessagesSquare },
  cerebro_analitico: { title: 'Cabeça da conversa', subtitle: 'O que o agente roda mentalmente a cada turno: contradições, promessas, viabilidade, saturação de pitch', icon: Brain },
  examples:          { title: 'Exemplos prontos', subtitle: 'Conversas de referência pra calibrar o tom', icon: MessageSquareQuote },
}

const SECTIONS: SectionKey[] = ['quem_ela_e', 'como_ela_conversa', 'cerebro_analitico', 'examples']

export function TabPlaybook({ agentId, agentName, companyName, produto }: Props) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    quem_ela_e: true,
    como_ela_conversa: true,
    cerebro_analitico: false,
    examples: false,
  })

  const toggle = (k: SectionKey) => setExpanded(s => ({ ...s, [k]: !s[k] }))

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <BookOpen className="w-5 h-5 text-indigo-500" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            Playbook
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure cada peça do prompt que o agente usa. Cada seção vira um bloco do prompt. Pra testar a configuração, vá na aba <span className="font-medium text-slate-700">Teste ao vivo</span>.
          </p>
        </div>
      </header>

      <div className="p-5 space-y-4">
        <V1V2ComparisonCard agentId={agentId} />
        <div className="space-y-2">
          {SECTIONS.map(key => {
            const def = SECTION_DEF[key]
            const Icon = def.icon
            return (
              <div key={key} className="border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => toggle(key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <Icon className="w-4 h-4 text-slate-500" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-slate-900">{def.title}</div>
                    <div className="text-xs text-slate-500">{def.subtitle}</div>
                  </div>
                  {expanded[key] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                {expanded[key] && (
                  <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/30">
                    {key === 'quem_ela_e' && <QuemElaESection agentId={agentId} agentName={agentName} companyName={companyName} produto={produto} />}
                    {key === 'como_ela_conversa' && <ComoConversaSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                    {key === 'cerebro_analitico' && <CognitiveAuditSection agentId={agentId} />}
                    {key === 'examples' && <ExamplesSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
