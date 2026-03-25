import { Package, DollarSign, AlertTriangle, XCircle } from 'lucide-react'
import { useInventoryStats } from '@/hooks/useInventoryStats'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function InventoryDashboard() {
    const { data: stats } = useInventoryStats()

    const cards = [
        { label: 'Produtos Ativos', value: stats?.totalProducts ?? 0, icon: Package, color: 'text-indigo-600 bg-indigo-50' },
        { label: 'Valor em Estoque', value: formatBRL(stats?.totalStockValue ?? 0), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Estoque Baixo', value: stats?.lowStockCount ?? 0, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
        { label: 'Sem Estoque', value: stats?.outOfStockCount ?? 0, icon: XCircle, color: 'text-red-600 bg-red-50' },
    ]

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(card => (
                <div key={card.label} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${card.color}`}>
                            <card.icon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">{card.label}</p>
                            <p className="text-lg font-semibold text-slate-900">{card.value}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
