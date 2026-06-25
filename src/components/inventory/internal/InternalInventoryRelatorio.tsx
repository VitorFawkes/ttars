import { useMemo, useState } from 'react'
import { Package, Users, MapPin } from 'lucide-react'
import {
    useInternalInventoryMovements,
    DESTINATION_LABELS,
    type InternalDestination,
} from '@/hooks/useInternalInventoryMovements'

// Relatório operacional do estoque interno: saídas por destino, por solicitante e
// por produto, num período. Trabalha sobre as movimentações mais recentes (até 300).

function daysAgoISO(days: number) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
}
function todayISO() {
    return new Date().toISOString().slice(0, 10)
}

export default function InternalInventoryRelatorio() {
    const { movements, isLoading } = useInternalInventoryMovements()
    const [from, setFrom] = useState(daysAgoISO(30))
    const [to, setTo] = useState(todayISO())

    const report = useMemo(() => {
        const saidas = movements.filter(m => {
            if (m.movement_type !== 'saida') return false
            const day = m.created_at.slice(0, 10)
            return day >= from && day <= to
        })

        const totalUnits = saidas.reduce((s, m) => s + Math.abs(m.quantity), 0)

        const byDestination = new Map<string, number>()
        const byRequester = new Map<string, number>()
        const byProduct = new Map<string, number>()

        for (const m of saidas) {
            const units = Math.abs(m.quantity)
            const destLabel = m.destination ? DESTINATION_LABELS[m.destination as InternalDestination] : 'Sem destino'
            byDestination.set(destLabel, (byDestination.get(destLabel) ?? 0) + units)
            const requester = m.requester?.nome || m.requested_by_name || 'Não informado'
            byRequester.set(requester, (byRequester.get(requester) ?? 0) + units)
            const prod = m.product?.name || '—'
            byProduct.set(prod, (byProduct.get(prod) ?? 0) + units)
        }

        const sortDesc = (map: Map<string, number>) =>
            [...map.entries()].sort((a, b) => b[1] - a[1])

        return {
            count: saidas.length,
            totalUnits,
            byDestination: sortDesc(byDestination),
            byRequester: sortDesc(byRequester).slice(0, 10),
            byProduct: sortDesc(byProduct).slice(0, 10),
        }
    }, [movements, from, to])

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">De</label>
                    <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Até</label>
                    <input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="ml-auto text-right">
                    <p className="text-xs text-slate-500">Saídas no período</p>
                    <p className="text-lg font-semibold text-slate-900">{report.count} <span className="text-sm font-normal text-slate-500">({report.totalUnits} un.)</span></p>
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-slate-500">Carregando relatório...</div>
            ) : report.count === 0 ? (
                <div className="text-center py-12 text-slate-500">Nenhuma saída registrada no período</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <ReportCard title="Por destino" icon={MapPin} rows={report.byDestination} unit="un." />
                    <ReportCard title="Top solicitantes" icon={Users} rows={report.byRequester} unit="un." />
                    <ReportCard title="Produtos mais retirados" icon={Package} rows={report.byProduct} unit="un." />
                </div>
            )}
            <p className="text-xs text-slate-400">Considera as saídas mais recentes (até 300 movimentações).</p>
        </div>
    )
}

function ReportCard({ title, icon: Icon, rows, unit }: {
    title: string; icon: typeof Package; rows: [string, number][]; unit: string
}) {
    const max = rows.length ? rows[0][1] : 0
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-slate-400">Sem dados</p>
            ) : (
                <div className="space-y-2">
                    {rows.map(([label, value]) => (
                        <div key={label}>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-700 truncate pr-2">{label}</span>
                                <span className="font-medium text-slate-900 tabular-nums whitespace-nowrap">{value} {unit}</span>
                            </div>
                            <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: max ? `${(value / max) * 100}%` : '0%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
