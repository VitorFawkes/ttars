import {
    Building2,
    Plane,
    Shield,
    Car,
    Compass,
    Settings,
    AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MondePreviewItem } from '@/hooks/useMondeSales'

const typeConfig: Record<string, {
    label: string
    mondeLabel: string
    icon: React.ElementType
    color: string
    bg: string
    border: string
}> = {
    hotel: {
        label: 'Hotel',
        mondeLabel: 'hotels',
        icon: Building2,
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
    },
    flight: {
        label: 'Voo',
        mondeLabel: 'airline_tickets',
        icon: Plane,
        color: 'text-indigo-700',
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
    },
    insurance: {
        label: 'Seguro',
        mondeLabel: 'insurances',
        icon: Shield,
        color: 'text-green-700',
        bg: 'bg-green-50',
        border: 'border-green-200',
    },
    transfer: {
        label: 'Transfer',
        mondeLabel: 'ground_transportations',
        icon: Car,
        color: 'text-orange-700',
        bg: 'bg-orange-50',
        border: 'border-orange-200',
    },
    experience: {
        label: 'Experiencia',
        mondeLabel: 'N/A',
        icon: Compass,
        color: 'text-purple-700',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
    },
}

const defaultConfig = {
    label: 'Outro',
    mondeLabel: 'N/A',
    icon: Settings,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
}

function formatValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'number') {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    }
    return String(value)
}

function formatMondeValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'number') return String(value)
    return `"${value}"`
}

interface MondeItemCardProps {
    item: MondePreviewItem
    index: number
}

export default function MondeItemCard({ item, index }: MondeItemCardProps) {
    const config = typeConfig[item.crm.item_type] || defaultConfig
    const Icon = config.icon
    const isUnmapped = item.monde_type === 'nao_mapeado'

    return (
        <div className={cn('rounded-lg border-2 overflow-hidden', config.border)}>
            {/* Header */}
            <div className={cn('flex items-center gap-3 px-4 py-3', config.bg)}>
                <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg bg-white/80', config.color)}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn('text-xs font-semibold uppercase tracking-wider', config.color)}>
                            {config.label}
                        </span>
                        {isUnmapped && (
                            <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                Sem mapeamento
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                        {item.crm.title}
                    </p>
                </div>
                <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
            </div>

            {/* Side by side mappings */}
            <div className="divide-y divide-gray-100">
                {/* Column headers */}
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                    <div className="px-4 py-2 bg-gray-50">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                            Dados no CRM
                        </span>
                    </div>
                    <div className="px-4 py-2 bg-gray-50">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                            Formato Monde API
                        </span>
                    </div>
                </div>

                {/* Field mappings */}
                {item.field_mappings.map((mapping, i) => (
                    <div key={i} className="grid grid-cols-2 divide-x divide-gray-100">
                        {/* CRM side */}
                        <div className="px-4 py-2">
                            <div className="text-[10px] text-gray-400 uppercase">{mapping.crm_field}</div>
                            <div className="text-sm text-gray-900 truncate">
                                {mapping.crm_field === 'Valor'
                                    ? formatValue(mapping.crm_value)
                                    : (mapping.crm_value ?? <span className="text-gray-300 italic">vazio</span>)}
                            </div>
                        </div>

                        {/* Monde side */}
                        <div className="px-4 py-2">
                            {mapping.monde_field === '(titulo nao enviado)' || mapping.monde_field === '-' ? (
                                <div className="text-xs text-gray-300 italic pt-2">
                                    {mapping.monde_field === '-' ? 'sem mapeamento' : 'nao enviado'}
                                </div>
                            ) : (
                                <>
                                    <div className="text-[10px] text-gray-400 font-mono">{mapping.monde_field}</div>
                                    <div className="text-sm font-mono text-emerald-700 truncate">
                                        {mapping.monde_field === 'value'
                                            ? String(mapping.monde_value)
                                            : formatMondeValue(mapping.monde_value)}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
