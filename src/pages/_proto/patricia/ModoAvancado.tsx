/**
 * Modo Avançado — as 11 abas técnicas reais do editor v2 em modo padrão.
 *
 * Cada aba aponta pra ONDE o dado vive (qual capítulo cobre) +
 * mostra o conteúdo bruto/técnico que o leigo não precisa ver.
 *
 * Lista de abas igual à do AiAgentV2DetailPage.tsx em v3+playbook:
 *  identidade, modo, playbook, regras_negocio, ferramentas, tecnico,
 *  handoff, decisoes, ativacao, teste (10 + saude = 11)
 */

import { useState } from 'react'
import {
  ChevronLeft, ChevronDown,
  Bot, Send, BookOpen, Stethoscope,
  Settings, Wrench, Handshake, Lightbulb, Power,
  Cog, PlayCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, Pill } from './Ui'

interface AdvTab {
  id: string
  label: string
  icon: LucideIcon
  /** Capítulo onde o leigo encontra a mesma config */
  chapterRef?: number
  body: string
}

const TABS: AdvTab[] = [
  { id: 'saude', label: 'Saúde', icon: Stethoscope, body: 'Dashboard de pendências (atalho do header).' },
  { id: 'identidade', label: 'Identidade', icon: Bot, chapterRef: 1, body: 'Nome, persona, descrição, tipo do agente.' },
  { id: 'modo', label: 'Modo de interação', icon: Send, chapterRef: 2, body: 'Inbound / outbound / hybrid + first_message_config + outbound_trigger_config.' },
  { id: 'playbook', label: 'Playbook', icon: BookOpen, chapterRef: 3, body: 'Identidade · voz · momentos · sondagem · pontuação · sinais silenciosos · exemplos. Cobre o que está espalhado em Caps 1-3-6.' },
  { id: 'regras_negocio', label: 'Regras de negócio', icon: Settings, chapterRef: 4, body: 'Identidade da empresa, idioma, pricing model, processo, agenda, campos protegidos, escalação.' },
  { id: 'ferramentas', label: 'Ferramentas', icon: Wrench, chapterRef: 5, body: 'ai_agent_skills (6 ferramentas habilitadas).' },
  { id: 'tecnico', label: 'Técnico', icon: Cog, body: 'Modelo, memória, contexto, multimodal, validador — consolidado. Para devs.' },
  { id: 'handoff', label: 'Handoff', icon: Handshake, chapterRef: 6, body: 'Sinais, ações, responsável, mensagem de transição.' },
  { id: 'decisoes', label: 'Decisões inteligentes', icon: Lightbulb, body: 'Campos que Patricia decide automaticamente (próxima ação, etapa do funil).' },
  { id: 'ativacao', label: 'Ativação', icon: Power, chapterRef: 7, body: 'Liga/desliga agente + vínculos de linha WhatsApp.' },
  { id: 'teste', label: 'Teste ao vivo', icon: PlayCircle, body: 'Sandbox de conversa (atalho do header).' },
]

const GROUPS: { group: string; items: AdvTab[] }[] = [
  { group: 'Visão geral', items: TABS.filter(t => t.id === 'saude') },
  { group: 'Comportamento', items: TABS.filter(t => ['identidade', 'modo', 'playbook'].includes(t.id)) },
  { group: 'Operação', items: TABS.filter(t => ['regras_negocio', 'ferramentas', 'handoff', 'decisoes', 'ativacao'].includes(t.id)) },
  { group: 'Avançado', items: TABS.filter(t => ['tecnico', 'teste'].includes(t.id)) },
]

interface Props {
  onClose: () => void
  onOpenChapter: (num: number) => void
}

export function ModoAvancado({ onClose, onOpenChapter }: Props) {
  const [activeId, setActiveId] = useState('identidade')
  const active = TABS.find(t => t.id === activeId)!

  return (
    <article>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-900 mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> voltar pra trilha
      </button>

      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-500">Atalho</p>
        <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight mt-1">Modo avançado</h1>
        <p className="text-[14px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
          As 11 seções originais do editor — pra quem já conhece o sistema e quer ir direto na config técnica.
        </p>
      </header>

      <div className="grid grid-cols-[220px_1fr] gap-6">
        <nav className="bg-white border border-slate-200 rounded-xl p-3 self-start space-y-4">
          {GROUPS.map(g => (
            <Group key={g.group} group={g.group} items={g.items} activeId={activeId} onSelect={setActiveId} />
          ))}
        </nav>

        <div className="space-y-5">
          <Card>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 grid place-items-center flex-shrink-0">
                <active.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[15px] font-semibold text-slate-900">{active.label}</h3>
                  <code className="text-[10px] font-mono text-slate-400">id: {active.id}</code>
                </div>
                <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">{active.body}</p>

                {active.chapterRef && (
                  <button
                    onClick={() => onOpenChapter(active.chapterRef!)}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Ver no Capítulo {active.chapterRef} da trilha →
                  </button>
                )}
              </div>
            </div>
          </Card>

          <aside className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-[12px] text-slate-600 flex items-start gap-3">
            <Pill tone="slate">prototype</Pill>
            <p className="leading-relaxed">
              No editor real, cada aba aqui ganha seu próprio formulário denso. Esta tela é um <strong>mapa</strong> —
              mostra ONDE encontrar cada coisa. Os capítulos da trilha apresentam o mesmo conteúdo, mas em forma
              que o leigo entende.
            </p>
          </aside>
        </div>
      </div>
    </article>
  )
}

function Group({
  group, items, activeId, onSelect,
}: {
  group: string
  items: AdvTab[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const hasActive = items.some(i => i.id === activeId)
  const [open, setOpen] = useState(hasActive || group === 'Comportamento')

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 hover:text-slate-700"
      >
        <span>{group}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', open ? '' : '-rotate-90')} />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          {items.map(item => {
            const Icon = item.icon
            const active = item.id === activeId
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors',
                  active
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-indigo-600' : 'text-slate-400')} />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
