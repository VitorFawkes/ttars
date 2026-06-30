import { useState, useEffect, createElement } from 'react'
import { Gauge, LayoutDashboard, GitCompare, Shuffle, Target, TrendingUp, Megaphone, TrendingDown, type LucideIcon } from 'lucide-react'
import { useOrg } from '@/contexts/OrgContext'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useAnalyticsVariant } from '@/hooks/analyticsWeddings/AnalyticsVariantContext'
import { countActiveFilters, defaultFilters, type AppliedFilters, type TabProps } from './components/FilterBar'
import { VisaoGeral } from './tabs/VisaoGeral'
import { FunilComparado } from './tabs/FunilComparado'
import { EntradaRealidade } from './tabs/EntradaRealidade'
import { Qualidade } from './tabs/Qualidade'
import { Perfil } from './tabs/Perfil'
import { Marketing } from './tabs/Marketing'
import { Perdas } from './tabs/Perdas'
import { Diretoria } from './tabs/Diretoria'
import { formatRange, periodToDates } from './lib/dates'

type Tab = 'operacao' | 'visao' | 'funil-comparado' | 'entrada-realidade' | 'qualidade' | 'perfil' | 'marketing' | 'perdas'

const TABS: { id: Tab; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'operacao', label: 'Operação', icon: Gauge, description: 'Estado geral da operação e tempos por fase' },
  { id: 'visao', label: 'Visão geral', icon: LayoutDashboard, description: 'KPIs, funil, conversões, alertas' },
  { id: 'funil-comparado', label: 'Funil comparado', icon: GitCompare, description: 'Comparar a conversão de um perfil entre dois períodos' },
  { id: 'entrada-realidade', label: 'Entrada × Realidade', icon: Shuffle, description: 'O que disse no site × o que virou' },
  { id: 'qualidade', label: 'Qualidade do lead', icon: Target, description: 'Faixa, convidados, local, cruzamentos' },
  { id: 'perfil', label: 'Lead ideal × Pipeline', icon: TrendingUp, description: 'Perfil de quem fechou × leads novos' },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, description: 'Origens, campanhas, atribuição' },
  { id: 'perdas', label: 'Motivos de perda', icon: TrendingDown, description: 'Onde leads caem e por quê' },
]

// Abas que usam o filtro padrão (por aba). Funil comparado tem o filtro próprio dele.
const TABS_COM_FILTRO: Tab[] = ['visao', 'entrada-realidade', 'qualidade', 'perfil', 'marketing', 'perdas']

// Persistência dos filtros por aba (localStorage, por org). Cada aba lembra o seu recorte
// mesmo ao trocar de aba ou sair e voltar da página.
const FILTERS_KEY = (orgId?: string) => `ww-analytics-filters-v1-${orgId ?? 'default'}`
const TAB_IDS: Tab[] = ['operacao', 'visao', 'funil-comparado', 'entrada-realidade', 'qualidade', 'perfil', 'marketing', 'perdas']

function loadFiltersByTab(orgId?: string): Record<Tab, AppliedFilters> {
  const base = Object.fromEntries(TAB_IDS.map(t => [t, defaultFilters()])) as Record<Tab, AppliedFilters>
  try {
    const raw = orgId ? localStorage.getItem(FILTERS_KEY(orgId)) : null
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<Tab, AppliedFilters>>
      for (const t of TAB_IDS) {
        // merge com o default pra absorver campos novos de filtro adicionados depois
        if (saved[t]) {
          const merged = { ...defaultFilters(), ...saved[t] }
          // Período relativo (mtd/7d/30d/90d/12m/ano…) guarda datas absolutas que envelhecem:
          // ao reabrir dias depois, "Este mês" continuaria preso na janela do dia em que foi salvo.
          // Recalcula a janela contra "hoje". Só 'custom' preserva as datas explícitas salvas.
          if (merged.period !== 'custom') {
            const { dateStart, dateEnd } = periodToDates(merged.period)
            merged.dateStart = dateStart
            merged.dateEnd = dateEnd
          }
          base[t] = merged
        }
      }
    }
  } catch { /* localStorage indisponível ou JSON inválido → defaults */ }
  return base
}

export default function AnalyticsWeddingsPage() {
  const { org } = useOrg()
  const { product } = useCurrentProductMeta()
  const orgId = org?.id
  const [activeTab, setActiveTab] = useState<Tab>('visao')
  // Filtro POR ABA — cada aba lembra o seu (não há mais filtro global). Persistido por org.
  const [filtersByTab, setFiltersByTab] = useState<Record<Tab, AppliedFilters>>(() => loadFiltersByTab(orgId))

  // Recarrega os filtros guardados quando o workspace muda (ou ao montar com a org já definida).
  useEffect(() => { if (orgId) setFiltersByTab(loadFiltersByTab(orgId)) }, [orgId])
  // Salva sempre que mudar (não reseta mais ao trocar de aba/sair da página).
  useEffect(() => {
    if (!orgId) return
    try { localStorage.setItem(FILTERS_KEY(orgId), JSON.stringify(filtersByTab)) } catch { /* quota/privado */ }
  }, [filtersByTab, orgId])
  const tabProps = (tab: Tab): TabProps => ({
    filters: filtersByTab[tab],
    onFiltersChange: (next) => setFiltersByTab(prev => ({ ...prev, [tab]: next })),
  })

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

  const activeFilters = TABS_COM_FILTRO.includes(activeTab) ? filtersByTab[activeTab] : undefined

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-ww-paper">
      <div className="max-w-[1600px] mx-auto p-6 space-y-5 min-w-0">
        <Header activeFilters={activeFilters} />
        {/* Mobile: navegação vira grade compacta acima do conteúdo; desktop: coluna fixa à esquerda */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-stretch lg:items-start">
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} filtersByTab={filtersByTab} />
          <div className="flex-1 min-w-0">
            {activeTab === 'operacao' && <Diretoria />}
            {activeTab === 'visao' && <VisaoGeral {...tabProps('visao')} />}
            {activeTab === 'funil-comparado' && <FunilComparado />}
            {activeTab === 'entrada-realidade' && <EntradaRealidade {...tabProps('entrada-realidade')} />}
            {activeTab === 'qualidade' && <Qualidade {...tabProps('qualidade')} />}
            {activeTab === 'perfil' && <Perfil {...tabProps('perfil')} />}
            {activeTab === 'marketing' && <Marketing {...tabProps('marketing')} />}
            {activeTab === 'perdas' && <Perdas {...tabProps('perdas')} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Header({ activeFilters }: { activeFilters?: AppliedFilters }) {
  const variant = useAnalyticsVariant()
  const isNative = variant === 'native'
  return (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="font-ww-serif text-2xl font-semibold text-ww-n700 tracking-tight">
          Welcome Weddings · Indicadores
          {isNative && (
            <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">WIP</span>
          )}
        </h1>
        <p className="text-sm text-ww-n500 mt-0.5">
          {isNative
            ? 'Análise de vendas e marketing com base nos dados do ttars (funil próprio)'
            : 'Análise de vendas e marketing com base em ActiveCampaign'}
          {activeFilters && (
            <span className="ml-2 text-ww-n400">· {formatRange(activeFilters.dateStart, activeFilters.dateEnd)}</span>
          )}
        </p>
      </div>
    </div>
  )
}

function Sidebar({ activeTab, setActiveTab, filtersByTab }: { activeTab: Tab; setActiveTab: (t: Tab) => void; filtersByTab: Record<Tab, AppliedFilters> }) {
  return (
    <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-20 self-start">
      <nav className="bg-white border border-ww-sand rounded-xl shadow-ww-lift p-2 grid grid-cols-2 gap-1 lg:block lg:space-y-0.5">
        {TABS.map(t => {
          // Bolinha com nº de filtros ativos — cada aba lembra o próprio recorte
          const nFiltros = TABS_COM_FILTRO.includes(t.id) ? countActiveFilters(filtersByTab[t.id]) : 0
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`w-full text-left px-3 py-2 lg:py-2.5 rounded-lg transition-colors active:scale-[0.99] ${
                activeTab === t.id
                  ? 'bg-ww-gold-soft text-ww-gold-ink'
                  : 'text-ww-n600 hover:bg-ww-cream/70'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {createElement(t.icon, { className: 'w-4 h-4 shrink-0' })}
                <span className="flex-1 truncate">{t.label}</span>
                {nFiltros > 0 && (
                  <span
                    title={`${nFiltros} ${nFiltros === 1 ? 'filtro ativo' : 'filtros ativos'} nesta aba`}
                    className="shrink-0 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-ww-rosewood text-white text-[10px] font-semibold tabular-nums"
                  >
                    {nFiltros}
                  </span>
                )}
              </div>
              <div className={`hidden lg:block text-[11px] mt-0.5 ml-6 ${activeTab === t.id ? 'text-ww-gold-ink/70' : 'text-ww-n400'}`}>{t.description}</div>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
