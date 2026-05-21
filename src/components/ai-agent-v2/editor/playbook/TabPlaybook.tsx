import { useMemo, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, User, UserCircle, Volume2, Clock, MessagesSquare, Target, Shield, Eye, MessageSquareQuote, Sparkles } from 'lucide-react'
import { IdentitySection } from './sections/IdentitySection'
import { VoiceSection } from './sections/VoiceSection'
import { MomentsSection } from './sections/MomentsSection'
import { QualificationSection } from './sections/QualificationSection'
import { BoundariesSection } from './sections/BoundariesSection'
import { SilentSignalsSection } from './sections/SilentSignalsSection'
import { ExamplesSection } from './sections/ExamplesSection'
import { V1V2ComparisonCard } from './V1V2ComparisonCard'
import { useV3Layout } from './v3/useV3Layout'
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
  | 'quem_ela_e'        // v3: agrega identity + voice + boundaries
  | 'como_ela_conversa' // v3: agrega moments + sondagem + pontuação + conhecimento
  | 'identity'          // legado v2
  | 'voice'             // legado v2
  | 'moments'           // legado v2
  | 'qualification'     // legado v2
  | 'boundaries'        // legado v2
  | 'signals'           // legado v2
  | 'examples'

const SECTION_DEF: Record<SectionKey, { title: string; subtitle: string; icon: typeof User }> = {
  quem_ela_e:        { title: 'Quem ela é', subtitle: 'Identidade, voz e linhas vermelhas — tudo que define a personalidade', icon: UserCircle },
  como_ela_conversa: { title: 'Como ela conversa', subtitle: 'Roteiro, sondagem, pontuação e conhecimento', icon: MessagesSquare },
  identity:          { title: 'Identidade', subtitle: 'Quem é a agente e qual a missão dela', icon: User },
  voice:             { title: 'Voz', subtitle: 'Como ela soa: tom, frases típicas e proibidas', icon: Volume2 },
  moments:           { title: 'Momentos da conversa', subtitle: 'Fases do funil + jogadas situacionais (objeções, etc.)', icon: Clock },
  qualification:     { title: 'Critérios de qualificação', subtitle: 'O que torna um cliente bom — somam pontos ou desqualificam', icon: Target },
  boundaries:        { title: 'Linhas vermelhas gerais', subtitle: 'Coisas que a agente NUNCA faz, em qualquer momento', icon: Shield },
  signals:           { title: 'Sinais silenciosos', subtitle: 'O que ela observa e anota sem comentar com o cliente', icon: Eye },
  examples:          { title: 'Exemplos prontos', subtitle: 'Conversas de referência pra calibrar o tom', icon: MessageSquareQuote },
}

const V3_SECTIONS: SectionKey[] = ['quem_ela_e', 'como_ela_conversa', 'examples']
const V2_SECTIONS: SectionKey[] = ['identity', 'voice', 'moments', 'qualification', 'boundaries', 'signals', 'examples']

export function TabPlaybook({ agentId, agentName, companyName, produto }: Props) {
  const { enabled: v3Enabled, toggle: toggleV3 } = useV3Layout()
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    quem_ela_e: true,
    como_ela_conversa: true,
    identity: true,
    voice: false,
    moments: false,
    qualification: false,
    boundaries: false,
    signals: false,
    examples: false,
  })

  const visibleSections = useMemo<SectionKey[]>(
    () => (v3Enabled ? V3_SECTIONS : V2_SECTIONS),
    [v3Enabled]
  )

  const toggle = (k: SectionKey) => setExpanded(s => ({ ...s, [k]: !s[k] }))

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <BookOpen className="w-5 h-5 text-indigo-500" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            Playbook
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 font-medium">beta</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure cada peça do prompt que o agente usa. Cada seção vira um bloco do prompt. Pra testar a configuração, vá na aba <span className="font-medium text-slate-700">Teste ao vivo</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleV3}
          className={`text-[11px] px-2.5 py-1 rounded-md border font-medium inline-flex items-center gap-1.5 transition-colors ${
            v3Enabled
              ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
          }`}
          title={v3Enabled
            ? 'Você está vendo a UI nova (cartão+drawer). Clique pra voltar à antiga.'
            : 'Experimentar a UI nova com cartões resumidos e drawer lateral.'}
        >
          <Sparkles className="w-3 h-3" />
          {v3Enabled ? 'UI nova ativa' : 'Experimentar UI nova'}
        </button>
      </header>

      <div className="p-5 space-y-4">
        <V1V2ComparisonCard agentId={agentId} />
        <div className="space-y-2">
          {visibleSections.map(key => {
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
                    {key === 'identity' && <IdentitySection agentId={agentId} agentName={agentName} companyName={companyName} produto={produto} />}
                    {key === 'voice' && <VoiceSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                    {key === 'moments' && <MomentsSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                    {key === 'qualification' && <QualificationSection agentId={agentId} />}
                    {key === 'boundaries' && <BoundariesSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                    {key === 'signals' && <SilentSignalsSection agentId={agentId} agentName={agentName} companyName={companyName} />}
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
