import { Loader2, TrendingUp, Users, Package, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGiftMetrics } from '@/hooks/useGiftMetrics'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const monthLabel = (key: string) => {
    const [y, m] = key.split('-')
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

export default function PresentesRelatorios() {
    const { data, isLoading } = useGiftMetrics()

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
            </div>
        )
    }

    const { summary, monthlySpend, topRecipients, topProducts, recentActivity } = data
    const maxMonthlyTotal = Math.max(...monthlySpend.map(m => m.total), 1)

    return (
        <div className="space-y-6">
            {/* Summary KPIs */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                        <span className="text-xs text-slate-500">Enviados este mês</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{summary.totalSentThisMonth}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-slate-500">Custo do mês</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{formatBRL(summary.totalCostThisMonth)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-amber-500" />
                        <span className="text-xs text-slate-500">Custo médio / presente</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{formatBRL(summary.avgCostPerGift)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-pink-500" />
                        <span className="text-xs text-slate-500">Contatos presenteados</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{summary.uniqueContacts}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Monthly spend chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Custo por mês</h3>
                    <div className="space-y-3">
                        {monthlySpend.map(month => (
                            <div key={month.month} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500 w-16">{monthLabel(month.month)}</span>
                                    <span className="text-slate-700 font-medium">{formatBRL(month.total)}</span>
                                </div>
                                <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                                    {month.tripCost > 0 && (
                                        <div
                                            className="h-full bg-indigo-400 rounded-l-full"
                                            style={{ width: `${(month.tripCost / maxMonthlyTotal) * 100}%` }}
                                            title={`Viagem: ${formatBRL(month.tripCost)}`}
                                        />
                                    )}
                                    {month.premiumCost > 0 && (
                                        <div
                                            className={cn('h-full bg-pink-400', month.tripCost === 0 && 'rounded-l-full')}
                                            style={{ width: `${(month.premiumCost / maxMonthlyTotal) * 100}%` }}
                                            title={`Premium: ${formatBRL(month.premiumCost)}`}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center gap-4 pt-2 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-400" /> Viagem</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-400" /> Premium</span>
                        </div>
                    </div>
                </div>

                {/* Top recipients */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Top destinatários</h3>
                    {topRecipients.length === 0 ? (
                        <p className="text-sm text-slate-400">Sem dados</p>
                    ) : (
                        <div className="space-y-2">
                            {topRecipients.map((r, idx) => (
                                <div key={r.contatoId} className="flex items-center gap-3 py-1.5">
                                    <span className="text-xs text-slate-400 w-5 text-right">{idx + 1}</span>
                                    <div className="h-7 w-7 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
                                        <span className="text-[10px] font-medium text-pink-700">{r.nome[0]}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{r.nome}</p>
                                    </div>
                                    <span className="text-xs text-slate-400">{r.giftCount}x</span>
                                    <span className="text-sm font-medium text-slate-700 tabular-nums">{formatBRL(r.totalCost)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top products */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Produtos mais enviados</h3>
                    {topProducts.length === 0 ? (
                        <p className="text-sm text-slate-400">Sem dados</p>
                    ) : (
                        <div className="space-y-2">
                            {topProducts.map((p, idx) => (
                                <div key={p.productId} className="flex items-center gap-3 py-1.5">
                                    <span className="text-xs text-slate-400 w-5 text-right">{idx + 1}</span>
                                    <div className="h-7 w-7 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                        <Package className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{p.name}</p>
                                    </div>
                                    <span className="text-xs text-slate-400">{p.unitsSent} un.</span>
                                    <span className="text-sm font-medium text-slate-700 tabular-nums">{formatBRL(p.totalCost)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent activity */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Atividade recente</h3>
                    {recentActivity.length === 0 ? (
                        <p className="text-sm text-slate-400">Sem atividade</p>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {recentActivity.map(a => (
                                <div key={a.id} className="flex items-center gap-3 py-1.5">
                                    <Activity className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-700 truncate">
                                            <span className="font-medium">{a.contatoNome}</span>
                                            {a.occasion && <span className="text-slate-400"> · {a.occasion.split(' — ')[0]}</span>}
                                        </p>
                                    </div>
                                    <span className={cn(
                                        'px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0',
                                        a.giftType === 'premium' ? 'bg-pink-100 text-pink-700' : 'bg-indigo-100 text-indigo-700'
                                    )}>
                                        {a.giftType === 'premium' ? 'Premium' : 'Viagem'}
                                    </span>
                                    <span className="text-xs text-slate-400 tabular-nums shrink-0">
                                        {new Date(a.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
