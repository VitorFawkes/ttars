import { NavLink, Link } from 'react-router-dom'
import { Crown, Briefcase, Users, Wrench, Phone, LineChart, Home, Sparkles, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAnalyticsV2Permissions } from '@/hooks/useAnalyticsV2Permissions'

interface NavItem {
  id: string
  to: string
  label: string
  icon: typeof Crown
  section: 'self' | 'personas' | 'tools'
}

const ALL_ITEMS: NavItem[] = [
  { id: 'self', to: '/analytics', label: 'Meu painel', icon: Home, section: 'self' },
  { id: 'dono', to: '/analytics/dono', label: 'Dono', icon: Crown, section: 'personas' },
  { id: 'comercial', to: '/analytics/comercial', label: 'Comercial', icon: Briefcase, section: 'personas' },
  { id: 'vendas', to: '/analytics/vendas', label: 'Vendas', icon: Users, section: 'personas' },
  { id: 'pos-venda', to: '/analytics/pos-venda', label: 'Pós-Venda', icon: Wrench, section: 'personas' },
  { id: 'sdr', to: '/analytics/sdr', label: 'SDR', icon: Phone, section: 'personas' },
  { id: 'explorar', to: '/analytics/explorar', label: 'Explorar', icon: LineChart, section: 'tools' },
]

export default function AnalyticsV2Sidebar() {
  const { canSeeDashboards } = useAnalyticsV2Permissions()

  // Filtrar itens: sempre mostrar "Meu painel" + Explorar, e dashboards permitidos
  const visibleItems = ALL_ITEMS.filter(
    item => item.section === 'self' || item.section === 'tools' || canSeeDashboards.includes(item.id)
  )

  const self = visibleItems.filter(i => i.section === 'self')
  const personas = visibleItems.filter(i => i.section === 'personas')
  const tools = visibleItems.filter(i => i.section === 'tools')

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-200 px-3 py-5 overflow-y-auto">
      <div className="flex items-center gap-2 px-2 mb-6">
        <Sparkles className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Analytics</span>
      </div>

      <NavSection items={self} />
      <SectionDivider label="Por área" />
      <NavSection items={personas} />
      <SectionDivider label="Ferramentas" />
      <NavSection items={tools} />

      <div className="mt-6 pt-4 border-t border-slate-100">
        <Link
          to="/analytics/legacy"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <Archive className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Analytics antigo</span>
        </Link>
      </div>
    </aside>
  )
}

function NavSection({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-col gap-0.5 mb-2">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/analytics'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mt-3 mb-1.5 px-2.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
  )
}
