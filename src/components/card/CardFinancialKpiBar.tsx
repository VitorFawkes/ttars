import { cn } from '@/lib/utils'
import { useCardFinancialSummary } from '@/hooks/useCardFinancialSummary'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface CardFinancialKpiBarProps {
    card: Card
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function CardFinancialKpiBar({ card }: CardFinancialKpiBarProps) {
    const isTripsCard = card.produto === 'TRIPS' || !card.produto
    const summary = useCardFinancialSummary(card.id, card)

    if (!isTripsCard) return null
    if (!summary.hasOrcamento) return null

    const isExcedeu = summary.falta < 0
    const faltaLabel = isExcedeu ? 'Excedeu' : 'Falta'
    const faltaValue = Math.abs(summary.falta)
    const percentAtingido = summary.orcamentoPrevisto > 0
        ? Math.min((summary.fechado / summary.orcamentoPrevisto) * 100, 100)
        : 0

    return (
        <div className="bg-white border-b border-slate-200 px-4 py-3">
            <div className="grid grid-cols-4 gap-4">
                <KpiCell label="Orçamento Previsto" value={formatBRL(summary.orcamentoPrevisto)} />
                <KpiCell label="Fechado" value={formatBRL(summary.fechado)} />
                <KpiCell
                    label={faltaLabel}
                    value={formatBRL(faltaValue)}
                    valueClassName={isExcedeu ? 'text-emerald-600' : 'text-amber-600'}
                />
                <KpiCell
                    label="Receita Fechada"
                    value={formatBRL(summary.receitaFechada)}
                    valueClassName="text-amber-700"
                />
            </div>
            <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                <div
                    className={cn(
                        'h-full transition-all',
                        isExcedeu ? 'bg-emerald-500' : 'bg-indigo-500'
                    )}
                    style={{ width: `${percentAtingido}%` }}
                />
            </div>
        </div>
    )
}

interface KpiCellProps {
    label: string
    value: string
    valueClassName?: string
}

function KpiCell({ label, value, valueClassName }: KpiCellProps) {
    return (
        <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium truncate">
                {label}
            </div>
            <div className={cn('text-base font-semibold text-slate-900 mt-0.5 truncate', valueClassName)}>
                {value}
            </div>
        </div>
    )
}
