import { NavLink, Link } from 'react-router-dom'
import {
  Activity,
  LayoutDashboard,
  HeartPulse,
  GitBranch,
  Users,
  Wallet,
  Repeat,
  PackageCheck,
  Clock,
  MessageCircle,
  LineChart,
  Sparkles,
  Archive,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof Activity
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Visão',
    items: [
      { to: '/analytics/pipeline', label: 'Pipeline', icon: Activity },
      { to: '/analytics/resumo', label: 'Resumo', icon: LayoutDashboard },
      { to: '/analytics/saude', label: 'Saúde', icon: HeartPulse },
    ],
  },
  {
    title: 'Funil & Vendas',
    items: [
      { to: '/analytics/funil', label: 'Funil', icon: GitBranch },
      { to: '/analytics/equipe', label: 'Equipe', icon: Users },
      { to: '/analytics/financeiro', label: 'Financeiro', icon: Wallet },
      { to: '/analytics/retencao', label: 'Retenção', icon: Repeat },
    ],
  },
  {
    title: 'Operação',
    items: [
      { to: '/analytics/operacoes', label: 'Operações', icon: PackageCheck },
      { to: '/analytics/sla', label: 'SLA', icon: Clock },
      { to: '/analytics/whatsapp', label: 'WhatsApp', icon: MessageCircle },
    ],
  },
  {
    title: 'Ferramentas',
    items: [{ to: '/analytics/explorar', label: 'Explorar', icon: LineChart }],
  },
]

export default function AnalyticsSidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-200 px-3 py-5 overflow-y-auto flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 mb-5">
        <Sparkles className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">
          Analytics
        </span>
      </div>

      <div className="flex-1">
        {SECTIONS.map((section, idx) => (
          <div key={section.title} className={cn(idx > 0 && 'mt-4')}>
            <div className="mb-1.5 px-2.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {section.title}
              </span>
            </div>
            <nav className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
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
          </div>
        ))}
      </div>

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
