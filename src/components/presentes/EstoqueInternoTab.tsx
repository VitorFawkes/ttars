import { useState } from 'react'
import { Package, ArrowLeftRight, AlertTriangle, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import InternalInventoryDashboard from '@/components/inventory/internal/InternalInventoryDashboard'
import InternalProductGrid from '@/components/inventory/internal/InternalProductGrid'
import InternalMovementLog from '@/components/inventory/internal/InternalMovementLog'
import InternalLowStockAlerts from '@/components/inventory/internal/InternalLowStockAlerts'
import InternalInventoryRelatorio from '@/components/inventory/internal/InternalInventoryRelatorio'

const tabs = [
    { key: 'products', label: 'Produtos', icon: Package },
    { key: 'movements', label: 'Movimentações', icon: ArrowLeftRight },
    { key: 'alerts', label: 'Alertas', icon: AlertTriangle },
    { key: 'report', label: 'Relatório', icon: BarChart3 },
] as const

type TabKey = typeof tabs[number]['key']

export default function EstoqueInternoTab() {
    const [activeTab, setActiveTab] = useState<TabKey>('products')

    return (
        <div className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <p className="text-sm text-indigo-900 font-medium">Estoque interno da agência</p>
                <p className="text-xs text-indigo-700/80 mt-0.5">
                    Itens usados internamente (On Board, ações internas, lojinha Aplause). Separado dos presentes enviados aos clientes.
                </p>
            </div>

            <InternalInventoryDashboard />

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="border-b border-slate-200 px-4">
                    <nav className="flex gap-4" aria-label="Tabs">
                        {tabs.map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors',
                                    activeTab === tab.key
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                )}>
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-4">
                    {activeTab === 'products' && <InternalProductGrid />}
                    {activeTab === 'movements' && <InternalMovementLog />}
                    {activeTab === 'alerts' && <InternalLowStockAlerts />}
                    {activeTab === 'report' && <InternalInventoryRelatorio />}
                </div>
            </div>
        </div>
    )
}
