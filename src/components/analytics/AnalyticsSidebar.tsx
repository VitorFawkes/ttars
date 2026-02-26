import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard,
    Users,
    GitBranch,
    Timer,
    MessageCircle,
    ShieldCheck,
    DollarSign,
    Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
    { to: '/analytics/overview', icon: LayoutDashboard, label: 'Visão Geral' },
    { to: '/analytics/team', icon: Users, label: 'Equipe' },
    { to: '/analytics/funnel', icon: GitBranch, label: 'Funil End-to-End' },
    { to: '/analytics/sla', icon: Timer, label: 'Velocidade & SLA' },
    { to: '/analytics/whatsapp', icon: MessageCircle, label: 'Conversas' },
    { to: '/analytics/operations', icon: ShieldCheck, label: 'Operação & Qualidade' },
    { to: '/analytics/financial', icon: DollarSign, label: 'Financeiro' },
    { to: '/analytics/retention', icon: Repeat, label: 'Recorrência' },
]

export default function AnalyticsSidebar() {
    return (
        <aside className="w-56 flex-shrink-0 flex flex-col h-full border-r border-slate-200 bg-white">
            <div className="px-5 py-6">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analytics</h2>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                            isActive
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                    >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </aside>
    )
}
