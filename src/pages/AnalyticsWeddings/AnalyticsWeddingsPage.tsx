import { useState } from 'react'
import { useOrg } from '@/contexts/OrgContext'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { FilterBar, useFilterParams } from './components/FilterBar'
import { VisaoGeral } from './tabs/VisaoGeral'
import { Jornada } from './tabs/Jornada'
import { EntradaRealidade } from './tabs/EntradaRealidade'
import { Equipe } from './tabs/Equipe'
import { Qualidade } from './tabs/Qualidade'
import { Perfil } from './tabs/Perfil'
import { FunilPerfil } from './tabs/FunilPerfil'
import { Marketing } from './tabs/Marketing'
import { Perdas } from './tabs/Perdas'
import { formatRange } from './lib/dates'

type Tab = 'visao' | 'jornada' | 'funil-perfil' | 'entrada-realidade' | 'equipe' | 'qualidade' | 'perfil' | 'marketing' | 'perdas'

const TABS: { id: Tab; label: string; icon: string; description: string }[] = [
  { id: 'visao', label: 'Visão geral', icon: '📊', description: 'KPIs, funil, conversões, alertas' },
  { id: 'jornada', label: 'Jornada do lead', icon: '🛤️', description: 'Funil real, tempos, dados fechamento' },
  { id: 'funil-perfil', label: 'Funil por perfil', icon: '🎯', description: 'Conversão por filtro vs baseline' },
  { id: 'entrada-realidade', label: 'Entrada × Realidade', icon: '🔄', description: 'O que disse no site × o que virou' },
  { id: 'equipe', label: 'Equipe', icon: '👥', description: 'Performance SDR, Closer, Planner' },
  { id: 'qualidade', label: 'Qualidade do lead', icon: '🎯', description: 'Faixa, convidados, local, cruzamentos' },
  { id: 'perfil', label: 'Lead ideal × Pipeline', icon: '📈', description: 'Perfil de quem fechou × leads novos' },
  { id: 'marketing', label: 'Marketing', icon: '📣', description: 'Origens, campanhas, atribuição' },
  { id: 'perdas', label: 'Motivos de perda', icon: '📉', description: 'Onde leads caem e por quê' },
]

export default function AnalyticsWeddingsPage() {
  const { org } = useOrg()
  const { product } = useCurrentProductMeta()
  const [activeTab, setActiveTab] = useState<Tab>('visao')

  if (!product || product.slug !== 'WEDDING') {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-amber-900">Esta página é só para Welcome Weddings</h2>
          <p className="mt-2 text-sm text-amber-800">
            Você está na org <strong>{org?.name ?? '?'}</strong>. Troque para "Welcome Weddings" no seletor de organização (canto superior).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-[1600px] mx-auto p-6 space-y-5">
        <Header />
        <FilterBar />
        <div className="flex gap-5 items-start">
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="flex-1 min-w-0">
            {activeTab === 'visao' && <VisaoGeral />}
            {activeTab === 'jornada' && <Jornada />}
            {activeTab === 'funil-perfil' && <FunilPerfil />}
            {activeTab === 'entrada-realidade' && <EntradaRealidade />}
            {activeTab === 'equipe' && <Equipe />}
            {activeTab === 'qualidade' && <Qualidade />}
            {activeTab === 'perfil' && <Perfil />}
            {activeTab === 'marketing' && <Marketing />}
            {activeTab === 'perdas' && <Perdas />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Header() {
  const filters = useFilterParams()
  return (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Welcome Weddings · Indicadores</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Análise de vendas e marketing com base em ActiveCampaign
          <span className="ml-2 text-slate-400">· {formatRange(filters.dateStart, filters.dateEnd)}</span>
        </p>
      </div>
    </div>
  )
}

function Sidebar({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (t: Tab) => void }) {
  return (
    <aside className="w-56 shrink-0 sticky top-20 self-start">
      <nav className="bg-white border border-slate-200 rounded-xl shadow-sm p-2 space-y-0.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition ${
              activeTab === t.id
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 ml-6">{t.description}</div>
          </button>
        ))}
      </nav>
    </aside>
  )
}
