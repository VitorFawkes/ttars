import { useState } from 'react'
import { Package, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import InventoryDashboard from '@/components/inventory/InventoryDashboard'
import ProductGrid from '@/components/inventory/ProductGrid'
import MovementLog from '@/components/inventory/MovementLog'
import LowStockAlerts from '@/components/inventory/LowStockAlerts'

const tabs = [
    { key: 'products', label: 'Produtos', icon: Package },
    { key: 'movements', label: 'Movimentações', icon: ArrowLeftRight },
    { key: 'alerts', label: 'Alertas', icon: AlertTriangle },
] as const

type TabKey = typeof tabs[number]['key']

export default function EstoqueTab() {
    const [activeTab, setActiveTab] = useState<TabKey>('products')

    return (
        <div className="space-y-6">
            <InventoryDashboard />

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="border-b border-slate-200 px-4">
                    <nav className="flex gap-4" aria-label="Tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors',
                                    activeTab === tab.key
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-4">
                    {activeTab === 'products' && <ProductGrid />}
                    {activeTab === 'movements' && <MovementLog />}
                    {activeTab === 'alerts' && <LowStockAlerts />}
                </div>
            </div>
        </div>
    )
}
