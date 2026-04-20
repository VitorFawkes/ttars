import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useTeamLeaderboard, type TeamLeaderboardRow } from '@/hooks/analytics/useTeamLeaderboard'
import { useTeamSlaCompliance } from '@/hooks/analytics/useTeamSlaCompliance'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

type SortKey = keyof Pick<
    TeamLeaderboardRow,
    'user_nome' | 'cards_envolvidos' | 'cards_ganhos' | 'win_rate' | 'receita_total' | 'ticket_medio' | 'tarefas_vencidas'
>

const FASE_LABEL: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    pos_venda: 'Pós-venda',
}

export default function TeamLeaderboardSection() {
    const { data: rows, isLoading, error, refetch } = useTeamLeaderboard()
    const { data: slaRows, isLoading: slaLoading } = useTeamSlaCompliance()
    const [sortKey, setSortKey] = useState<SortKey>('receita_total')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const slaByUser = useMemo(() => {
        const map = new Map<string, { compliance: number | null; transicoes: number; tempo: number }>()
        for (const s of slaRows ?? []) {
            map.set(s.user_id, {
                compliance: s.compliance_rate,  // pode vir NULL se nenhuma etapa tinha SLA configurado
                transicoes: s.total_transicoes,
                tempo: s.tempo_medio_horas,
            })
        }
        return map
    }, [slaRows])

    const sortedRows = useMemo(() => {
        const list = [...(rows ?? [])]
        return list.sort((a, b) => {
            const av = a[sortKey] as string | number
            const bv = b[sortKey] as string | number
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
            }
            const na = typeof av === 'number' ? av : 0
            const nb = typeof bv === 'number' ? bv : 0
            return sortDir === 'asc' ? na - nb : nb - na
        })
    }, [rows, sortKey, sortDir])

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const sortIcon = (key: SortKey) => {
        if (sortKey !== key) return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
        return sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
    }

    if (error) {
        return <QueryErrorState compact title="Erro ao carregar ranking da equipe" onRetry={() => refetch()} />
    }

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Ranking consolidado</h3>
                </div>
                <p className="text-xs text-slate-500">Uma linha por pessoa, somando todas as fases em que atuou</p>
            </div>

            {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Carregando ranking…</div>
            ) : sortedRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Nenhum envolvimento no período selecionado.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-xs text-slate-500 uppercase tracking-wider">
                                <th className="text-left px-5 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('user_nome')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Pessoa {sortIcon('user_nome')}
                                    </button>
                                </th>
                                <th className="text-left px-3 py-2.5 font-medium">Fases</th>
                                <th className="text-right px-3 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('cards_envolvidos')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Envolvidos {sortIcon('cards_envolvidos')}
                                    </button>
                                </th>
                                <th className="text-right px-3 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('cards_ganhos')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Ganhos {sortIcon('cards_ganhos')}
                                    </button>
                                </th>
                                <th className="text-right px-3 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('win_rate')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Win rate {sortIcon('win_rate')}
                                    </button>
                                </th>
                                <th className="text-right px-3 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('receita_total')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Receita {sortIcon('receita_total')}
                                    </button>
                                </th>
                                <th className="text-right px-3 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('ticket_medio')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Ticket médio {sortIcon('ticket_medio')}
                                    </button>
                                </th>
                                <th className="text-right px-3 py-2.5 font-medium">SLA</th>
                                <th className="text-right px-3 py-2.5 font-medium">
                                    <button onClick={() => toggleSort('tarefas_vencidas')} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Vencidas {sortIcon('tarefas_vencidas')}
                                    </button>
                                </th>
                                <th className="px-5 py-2.5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedRows.map((row) => {
                                const sla = slaByUser.get(row.user_id)
                                return (
                                    <tr key={row.user_id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-2.5 font-medium text-slate-900">{row.user_nome}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex flex-wrap gap-1">
                                                {row.fases.map((f) => (
                                                    <span
                                                        key={f}
                                                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 font-medium uppercase tracking-wider"
                                                    >
                                                        {FASE_LABEL[f] ?? f}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">{row.cards_envolvidos}</td>
                                        <td className="px-3 py-2.5 text-right text-emerald-600 tabular-nums font-medium">{row.cards_ganhos}</td>
                                        <td className={cn(
                                            'px-3 py-2.5 text-right tabular-nums font-medium',
                                            row.win_rate >= 50 ? 'text-emerald-600' : row.win_rate >= 25 ? 'text-amber-600' : 'text-slate-500'
                                        )}>
                                            {row.cards_ganhos + row.cards_perdidos > 0 ? `${row.win_rate}%` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-800 tabular-nums">
                                            {row.receita_total > 0 ? formatCurrency(row.receita_total) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">
                                            {row.ticket_medio > 0 ? formatCurrency(row.ticket_medio) : '—'}
                                        </td>
                                        <td className={cn(
                                            'px-3 py-2.5 text-right tabular-nums font-medium text-xs',
                                            slaLoading ? 'text-slate-400' :
                                                !sla || sla.transicoes === 0 || sla.compliance === null ? 'text-slate-400' :
                                                    sla.compliance >= 80 ? 'text-emerald-600' :
                                                        sla.compliance >= 50 ? 'text-amber-600' : 'text-rose-600'
                                        )}>
                                            {slaLoading
                                                ? '…'
                                                : !sla || sla.transicoes === 0 || sla.compliance === null
                                                    ? '—'
                                                    : `${sla.compliance}%`}
                                        </td>
                                        <td className={cn(
                                            'px-3 py-2.5 text-right tabular-nums font-medium',
                                            row.tarefas_vencidas === 0 ? 'text-emerald-600' : row.tarefas_vencidas <= 3 ? 'text-amber-600' : 'text-rose-600'
                                        )}>
                                            {row.tarefas_vencidas}
                                        </td>
                                        <td className="px-5 py-2.5 text-right">
                                            <Link
                                                to={`/leads?ownerId=${row.user_id}`}
                                                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                                            >
                                                Cards <ExternalLink className="w-3 h-3" />
                                            </Link>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
