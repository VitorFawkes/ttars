import { NavLink } from 'react-router-dom'
import { FileText, Plus, LayoutDashboard, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const navSections = [
    {
        title: 'Relatórios',
        items: [
            { to: '/reports', icon: FileText, label: 'Meus Relatórios', end: true },
            { to: '/reports/new', icon: Plus, label: 'Novo Relatório' },
        ],
    },
    {
        title: 'Dashboards',
        items: [
            { to: '/reports/dashboards', icon: LayoutDashboard, label: 'Meus Dashboards', end: true },
            { to: '/reports/dashboards/new', icon: Plus, label: 'Novo Dashboard' },
        ],
    },
    {
        title: 'Templates',
        items: [
            { to: '/reports?tab=templates', icon: Sparkles, label: 'Relatórios Pré-Prontos' },
        ],
    },
]

export default function ReportsSidebar() {
    return (
        <aside className="w-56 flex-shrink-0 flex flex-col h-full border-r border-slate-200 bg-white">
            <div className="px-5 py-6">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Relatórios</h2>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 space-y-5">
                {navSections.map((section) => (
                    <div key={section.title}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">
                            {section.title}
                        </div>
                        <div className="space-y-0.5">
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
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
                        </div>
                    </div>
                ))}
            </nav>
        </aside>
    )
}
