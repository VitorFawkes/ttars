import { useState, useMemo } from 'react'
import { BookOpen, ChevronDown, ChevronRight, User, Volume2, Clock, Target, Shield, Eye, MessageSquareQuote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IdentitySection } from './sections/IdentitySection'
import { VoiceSection } from './sections/VoiceSection'
import { MomentsSection } from './sections/MomentsSection'
import { QualificationSection } from './sections/QualificationSection'
import { BoundariesSection } from './sections/BoundariesSection'
import { SilentSignalsSection } from './sections/SilentSignalsSection'
import { ExamplesSection } from './sections/ExamplesSection'
import { PlaybookPreviewPanel } from './preview/PlaybookPreviewPanel'
import { V1V2ComparisonCard } from './V1V2ComparisonCard'
import { useAgentIdentity } from '@/hooks/playbook/useAgentIdentity'
import { useAgentVoice } from '@/hooks/playbook/useAgentVoice'
import { useAgentBoundaries } from '@/hooks/playbook/useAgentBoundaries'
import { useAgentMoments } from '@/hooks/playbook/useAgentMoments'
import { useAgentSilentSignals } from '@/hooks/playbook/useAgentSilentSignals'
import { useAgentFewShotExamples } from '@/hooks/playbook/useAgentFewShotExamples'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

type SectionKey = 'identity' | 'voice' | 'moments' | 'qualification' | 'boundaries' | 'signals' | 'examples'

const SECTIONS: Array<{ key: SectionKey; title: string; subtitle: string; icon: typeof User }> = [
  { key: 'identity', title: 'Identidade', subtitle: 'Papel e missão em 1 frase', icon: User },
  { key: 'voice', title: 'Voz', subtitle: 'Tom, emoji, frases típicas e proibidas', icon: Volume2 },
  { key: 'moments', title: 'Momentos da conversa', subtitle: 'Frases-âncora por fase com triggers e red lines', icon: Clock },
  { key: 'qualification', title: 'Qualificação', subtitle: 'Critérios qualify / disqualify / bonus', icon: Target },
  { key: 'boundaries', title: 'Linhas vermelhas gerais', subtitle: 'O que o agente NUNCA faz', icon: Shield },
  { key: 'signals', title: 'Sinais silenciosos', subtitle: 'Coisas que o agente registra sem comentar', icon: Eye },
  { key: 'examples', title: 'Exemplos', subtitle: 'Pares lead→agente pra calibrar', icon: MessageSquareQuote },
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
  const [showPreview, setShowPreview] = useState(true)

  // Carrega configs pra o preview em tempo real
  const { identity } = useAgentIdentity(agentId)
  const { voice } = useAgentVoice(agentId)
  const { boundaries } = useAgentBoundaries(agentId)
  const { moments } = useAgentMoments(agentId)
  const { signals } = useAgentSilentSignals(agentId)
  const { examples } = useAgentFewShotExamples(agentId)

  const previewConfig = useMemo(() => ({
    identity_config: identity ?? null,
    voice_config: voice ?? null,
    boundaries_config: boundaries ?? null,
    moments: moments.map(m => ({
      id: m.id,
      moment_key: m.moment_key,
      moment_label: m.moment_label,
      display_order: m.display_order,
      trigger_type: m.trigger_type,
      trigger_config: m.trigger_config,
      message_mode: m.message_mode,
      anchor_text: m.anchor_text,
      red_lines: m.red_lines,
      collects_fields: m.collects_fields,
      enabled: m.enabled,
    })),
    silent_signals: signals.map(s => ({
      id: s.id,
      signal_key: s.signal_key,
      signal_label: s.signal_label,
      detection_hint: s.detection_hint,
      crm_field_key: s.crm_field_key,
      how_to_use: s.how_to_use,
      display_order: s.display_order,
      enabled: s.enabled,
    })),
    few_shot_examples: examples.map(e => ({
      id: e.id,
      lead_message: e.lead_message,
      agent_response: e.agent_response,
      context_note: e.context_note,
      related_moment_key: e.related_moment_key,
      related_signal_key: e.related_signal_key,
      display_order: e.display_order,
      enabled: e.enabled,
    })),
  }), [identity, voice, boundaries, moments, signals, examples])

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
            Configure cada peça do prompt que o agente usa. Cada seção vira um bloco do prompt.
          </p>
        </div>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 hover:border-slate-300"
        >
          {showPreview ? 'Ocultar prévia' : 'Mostrar prévia'}
        </button>
      </header>

      <div className={cn('grid grid-cols-1', showPreview ? 'lg:grid-cols-[2fr_1fr]' : '')}>
        <div className="p-5 space-y-4 overflow-auto">
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

        {showPreview && (
          <div className="hidden lg:block h-[calc(100vh-220px)] sticky top-0">
            <PlaybookPreviewPanel agentId={agentId} previewConfig={previewConfig} />
          </div>
        )}
      </div>
    </section>
  )
}
