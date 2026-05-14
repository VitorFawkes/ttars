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
        <div className="bg-white border-b border-slate-200 px-4 py-2">
            <div className="grid grid-cols-4 gap-4">
                <KpiCell label="Orçamento" value={formatBRL(summary.orcamentoPrevisto)} />
                <KpiCell label="Fechado" value={formatBRL(summary.fechado)} />
                <KpiCell
                    label={faltaLabel}
                    value={formatBRL(faltaValue)}
                />
                <KpiCell
                    label="Receita"
                    value={formatBRL(summary.receitaFechada)}
                />
            </div>
            <div className="mt-1.5 h-px bg-slate-100 overflow-hidden">
                <div
                    className="h-full bg-slate-300 transition-[width] duration-300 ease-out"
                    style={{ width: `${percentAtingido}%` }}
                />
            </div>
        </div>
    )
}

interface KpiCellProps {
    label: string
    value: string
}

function KpiCell({ label, value }: KpiCellProps) {
    return (
        <div className="min-w-0">
            <div className="text-xs text-slate-500 truncate">{label}</div>
            <div className={cn('text-sm font-medium text-slate-900 mt-0.5 truncate tabular-nums')}>
                {value}
            </div>
        </div>
    )
}
