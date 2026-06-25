import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Undo2 } from 'lucide-react'
import {
    useInternalInventoryMovements,
    DESTINATION_LABELS,
    type InternalInventoryMovement,
} from '@/hooks/useInternalInventoryMovements'
import { cn } from '@/lib/utils'

const typeConfig: Record<string, { label: string; icon: typeof ArrowDownCircle; color: string }> = {
    entrada: { label: 'Entrada', icon: ArrowDownCircle, color: 'text-emerald-600' },
    saida: { label: 'Saída', icon: ArrowUpCircle, color: 'text-amber-600' },
    ajuste: { label: 'Ajuste', icon: RefreshCw, color: 'text-indigo-600' },
    devolucao: { label: 'Devolução', icon: Undo2, color: 'text-blue-600' },
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
    })
}

const personName = (profile?: { nome: string } | null, fallback?: string | null) =>
    profile?.nome || fallback || '—'

export default function InternalMovementLog() {
    const { movements, isLoading } = useInternalInventoryMovements()

    if (isLoading) return <div className="text-center py-12 text-slate-500">Carregando movimentações...</div>

    if (movements.length === 0) {
        return <div className="text-center py-12 text-slate-500">Nenhuma movimentação registrada</div>
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Data</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Produto</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Tipo</th>
                        <th className="text-right py-3 px-3 font-medium text-slate-500">Qtd</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Destino</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Solicitado por</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Retirado por</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Obs.</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-500">Registrado por</th>
                    </tr>
                </thead>
                <tbody>
                    {movements.map((m: InternalInventoryMovement) => {
                        const cfg = typeConfig[m.movement_type] || typeConfig.ajuste
                        const Icon = cfg.icon

                        return (
                            <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDate(m.created_at)}</td>
                                <td className="py-2.5 px-3">
                                    <span className="font-medium text-slate-900">{m.product?.name ?? '—'}</span>
                                    {m.product?.sku && <span className="text-xs text-slate-400 ml-1">({m.product.sku})</span>}
                                </td>
                                <td className="py-2.5 px-3">
                                    <span className={cn('flex items-center gap-1.5', cfg.color)}>
                                        <Icon className="h-3.5 w-3.5" />
                                        {cfg.label}
                                    </span>
                                </td>
                                <td className={cn(
                                    'py-2.5 px-3 text-right font-medium tabular-nums',
                                    m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'
                                )}>
                                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">
                                    {m.destination ? DESTINATION_LABELS[m.destination] : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">{personName(m.requester, m.requested_by_name)}</td>
                                <td className="py-2.5 px-3 text-slate-600">{personName(m.withdrawer, m.withdrawn_by_name)}</td>
                                <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate">{m.reason || '—'}</td>
                                <td className="py-2.5 px-3 text-slate-500">{m.performer?.nome ?? '—'}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
