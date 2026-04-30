import { useState } from 'react'
import { Target, Search, Trophy, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoteiroSection } from '../RoteiroSection'
import { SondagemSection } from './SondagemSection'
import { TabPontuacao } from '../../../TabPontuacao'
import { TabConhecimento } from '../../../TabConhecimento'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

type SubTab = 'roteiro' | 'sondagem' | 'pontuacao' | 'conhecimento'

const SUB_TABS: Array<{ key: SubTab; label: string; subtitle: string; icon: typeof Target }> = [
  { key: 'roteiro', label: 'Roteiro', subtitle: 'Fases e jogadas', icon: Target },
  { key: 'sondagem', label: 'Sondagem', subtitle: 'Slots e sinais', icon: Search },
  { key: 'pontuacao', label: 'Pontuação', subtitle: 'Regras e simulador', icon: Trophy },
  { key: 'conhecimento', label: 'Conhecimento', subtitle: 'Bases vinculadas', icon: BookOpen },
]

/**
 * Área "Como ela conversa" da redesign UI v3 — Fase 3.
 *
 * Concentra toda a configuração do COMPORTAMENTO de conversa em uma única
 * área, com 4 sub-abas:
 *
 *   1. Roteiro      — fases do funil + jogadas situacionais (RoteiroSection)
 *   2. Sondagem     — slots de descoberta + sinais silenciosos + cruzamento
 *                     com regras de pontuação (SondagemSection)
 *   3. Pontuação    — regras qualify/disqualify/bonus + simulador interativo
 *                     (reusa TabPontuacao)
 *   4. Conhecimento — bases vinculadas (reusa TabConhecimento)
 *
 * Cada sub-aba reusa componente já existente (zero duplicação de lógica de
 * persistência). A novidade é a organização: tudo o que define
 * comportamento de conversa fica num lugar só, com regra de decisão clara.
 */
export function ComoConversaSection({ agentId, agentName, companyName }: Props) {
  const [activeTab, setActiveTab] = useState<SubTab>('roteiro')

  return (
    <div className="space-y-5">
      {/* Sub-tabs nav — scroll horizontal em mobile pra não quebrar layout */}
      <nav className="flex gap-1 border-b border-slate-200 -mx-4 px-4 overflow-x-auto scrollbar-thin">
        {SUB_TABS.map(t => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0',
                active
                  ? 'border-indigo-500 text-indigo-700 font-semibold bg-indigo-50/50 rounded-t-md'
                  : 'border-transparent font-medium text-slate-500 hover:text-slate-900 hover:border-slate-200'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              <span className={cn(
                'text-[10px] hidden md:inline',
                active ? 'text-indigo-500' : 'text-slate-400',
              )}>
                · {t.subtitle}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Sub-tab content */}
      <div className="pt-2">
        {activeTab === 'roteiro' && <RoteiroSection agentId={agentId} agentName={agentName} companyName={companyName} />}
        {activeTab === 'sondagem' && <SondagemSection agentId={agentId} agentName={agentName} companyName={companyName} />}
        {activeTab === 'pontuacao' && <TabPontuacao agentId={agentId} />}
        {activeTab === 'conhecimento' && <TabConhecimento agentId={agentId} />}
      </div>
    </div>
  )
}
