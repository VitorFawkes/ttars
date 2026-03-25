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

export default function InventoryPage() {
    const [activeTab, setActiveTab] = useState<TabKey>('products')

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Estoque</h1>
                    <p className="text-sm text-slate-500 mt-1">Gerencie produtos, movimentações e alertas de estoque</p>
                </div>

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
        </div>
    )
}
