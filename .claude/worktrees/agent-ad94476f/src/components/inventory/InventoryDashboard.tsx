import { useState, useRef, useEffect } from 'react'
import { Package, DollarSign, AlertTriangle, XCircle, ChevronRight } from 'lucide-react'
import { useInventoryStats } from '@/hooks/useInventoryStats'
import { useInventoryProducts, type InventoryProduct } from '@/hooks/useInventoryProducts'
import { cn } from '@/lib/utils'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

type AlertFilter = 'low' | 'out' | null

export default function InventoryDashboard() {
    const { data: stats } = useInventoryStats()
    const { products } = useInventoryProducts()
    const [activeFilter, setActiveFilter] = useState<AlertFilter>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const lowStock = products.filter(p => p.current_stock > 0 && p.current_stock <= p.low_stock_threshold)
    const outOfStock = products.filter(p => p.current_stock === 0)

    const toggle = (filter: AlertFilter) => {
        setActiveFilter(prev => prev === filter ? null : filter)
    }

    // Close on click outside
    useEffect(() => {
        if (!activeFilter) return
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setActiveFilter(null)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [activeFilter])

    const visibleProducts = activeFilter === 'low' ? lowStock : activeFilter === 'out' ? outOfStock : []

    return (
        <div className="space-y-0" ref={panelRef}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Produtos Ativos */}
                <StatCard
                    label="Produtos Ativos"
                    value={stats?.totalProducts ?? 0}
                    icon={Package}
                    color="text-indigo-600 bg-indigo-50"
                />

                {/* Valor em Estoque */}
                <StatCard
                    label="Valor em Estoque"
                    value={formatBRL(stats?.totalStockValue ?? 0)}
                    icon={DollarSign}
                    color="text-emerald-600 bg-emerald-50"
                />

                {/* Estoque Baixo — clicável */}
                <StatCard
                    label="Estoque Baixo"
                    value={stats?.lowStockCount ?? 0}
                    icon={AlertTriangle}
                    color="text-amber-600 bg-amber-50"
                    active={activeFilter === 'low'}
                    clickable={(stats?.lowStockCount ?? 0) > 0}
                    onClick={() => toggle('low')}
                    ringColor="ring-amber-400"
                />

                {/* Sem Estoque — clicável */}
                <StatCard
                    label="Sem Estoque"
                    value={stats?.outOfStockCount ?? 0}
                    icon={XCircle}
                    color="text-red-600 bg-red-50"
                    active={activeFilter === 'out'}
                    clickable={(stats?.outOfStockCount ?? 0) > 0}
                    onClick={() => toggle('out')}
                    ringColor="ring-red-400"
                />
            </div>

            {/* Expandable detail panel */}
            {activeFilter && visibleProducts.length > 0 && (
                <div className={cn(
                    "mt-3 bg-white border rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200",
                    activeFilter === 'low' ? 'border-amber-200' : 'border-red-200'
                )}>
                    <div className={cn(
                        "px-4 py-2.5 border-b flex items-center gap-2",
                        activeFilter === 'low' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                    )}>
                        {activeFilter === 'low' ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                        <span className={cn(
                            "text-xs font-semibold",
                            activeFilter === 'low' ? 'text-amber-700' : 'text-red-700'
                        )}>
                            {activeFilter === 'low'
                                ? `${visibleProducts.length} produto${visibleProducts.length > 1 ? 's' : ''} com estoque baixo`
                                : `${visibleProducts.length} produto${visibleProducts.length > 1 ? 's' : ''} sem estoque`
                            }
                        </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {visibleProducts.map(p => (
                            <ProductAlertRow key={p.id} product={p} type={activeFilter} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function StatCard({ label, value, icon: Icon, color, active, clickable, onClick, ringColor }: {
    label: string
    value: string | number
    icon: typeof Package
    color: string
    active?: boolean
    clickable?: boolean
    onClick?: () => void
    ringColor?: string
}) {
    return (
        <div
            onClick={clickable ? onClick : undefined}
            className={cn(
                "bg-white border border-slate-200 rounded-xl shadow-sm p-4 transition-all",
                clickable && "cursor-pointer hover:shadow-md hover:border-slate-300 group",
                active && ringColor && `ring-2 ${ringColor} border-transparent shadow-md`,
            )}
        >
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-lg font-semibold text-slate-900">{value}</p>
                </div>
                {clickable && (
                    <ChevronRight className={cn(
                        "h-4 w-4 text-slate-300 transition-transform group-hover:text-slate-500",
                        active && "rotate-90 text-slate-500"
                    )} />
                )}
            </div>
        </div>
    )
}

function ProductAlertRow({ product, type }: { product: InventoryProduct; type: 'low' | 'out' }) {
    const imgUrl = product.image_path
        ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${product.image_path}`
        : null

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
            {imgUrl ? (
                <img src={imgUrl} alt={product.name} className="h-8 w-8 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
            ) : (
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-slate-300" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                <p className="text-xs text-slate-400">{product.sku}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                    type === 'out'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                )}>
                    {product.current_stock} / {product.low_stock_threshold}
                </span>
            </div>
        </div>
    )
}
