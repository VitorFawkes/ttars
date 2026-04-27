import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, User, Volume2, Clock, Target, Shield, Eye, MessageSquareQuote } from 'lucide-react'
import { IdentitySection } from './sections/IdentitySection'
import { VoiceSection } from './sections/VoiceSection'
import { MomentsSection } from './sections/MomentsSection'
import { QualificationSection } from './sections/QualificationSection'
import { BoundariesSection } from './sections/BoundariesSection'
import { SilentSignalsSection } from './sections/SilentSignalsSection'
import { ExamplesSection } from './sections/ExamplesSection'
import { V1V2ComparisonCard } from './V1V2ComparisonCard'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

type SectionKey = 'identity' | 'voice' | 'moments' | 'qualification' | 'boundaries' | 'signals' | 'examples'

const SECTIONS: Array<{ key: SectionKey; title: string; subtitle: string; icon: typeof User }> = [
  { key: 'identity', title: 'Identidade', subtitle: 'Quem é a agente e qual a missão dela', icon: User },
  { key: 'voice', title: 'Voz', subtitle: 'Como ela soa: tom, frases típicas e proibidas', icon: Volume2 },
  { key: 'moments', title: 'Momentos da conversa', subtitle: 'Fases do funil + jogadas situacionais (objeções, etc.)', icon: Clock },
  { key: 'qualification', title: 'Critérios de qualificação', subtitle: 'O que torna um cliente bom — somam pontos ou desqualificam', icon: Target },
  { key: 'boundaries', title: 'Linhas vermelhas gerais', subtitle: 'Coisas que a agente NUNCA faz, em qualquer momento', icon: Shield },
  { key: 'signals', title: 'Sinais silenciosos', subtitle: 'O que ela observa e anota sem comentar com o cliente', icon: Eye },
  { key: 'examples', title: 'Exemplos prontos', subtitle: 'Conversas de referência pra calibrar o tom', icon: MessageSquareQuote },
]

export function TabPlaybook({ agentId, agentName, companyName }: Props) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    identity: true,
    voice: false,
    moments: false,
    qualification: false,
    boundaries: false,
    signals: false,
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
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 font-medium">beta</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure cada peça do prompt que o agente usa. Cada seção vira um bloco do prompt. Pra testar a configuração, vá na aba <span className="font-medium text-slate-700">Teste ao vivo</span>.
          </p>
        </div>
      </header>

      <div className="p-5 space-y-4">
        <V1V2ComparisonCard agentId={agentId} />
        <div className="space-y-2">
          {SECTIONS.map(s => (
            <div key={s.key} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => toggle(s.key)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <s.icon className="w-4 h-4 text-slate-500" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-slate-900">{s.title}</div>
                  <div className="text-xs text-slate-500">{s.subtitle}</div>
                </div>
                {expanded[s.key] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>
              {expanded[s.key] && (
                <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/30">
                  {s.key === 'identity' && <IdentitySection agentId={agentId} agentName={agentName} companyName={companyName} />}
                  {s.key === 'voice' && <VoiceSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                  {s.key === 'moments' && <MomentsSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                  {s.key === 'qualification' && <QualificationSection agentId={agentId} />}
                  {s.key === 'boundaries' && <BoundariesSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                  {s.key === 'signals' && <SilentSignalsSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                  {s.key === 'examples' && <ExamplesSection agentId={agentId} agentName={agentName} companyName={companyName} />}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
