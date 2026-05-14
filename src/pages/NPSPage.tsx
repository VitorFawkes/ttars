import { useNavigate } from 'react-router-dom'
import { Gauge, Loader2, MessageSquare, Percent, Send, Smile } from 'lucide-react'
import AdminPageHeader from '../components/admin/ui/AdminPageHeader'
import { useNPSKpis, type NPSKpis } from '../hooks/useNPSKpis'
import { useNPSResponses, type NPSResponseRow } from '../hooks/useNPSResponses'
import { cn } from '../lib/utils'

type StatColor = 'indigo' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'slate' | 'emerald' | 'rose'

const COLOR_MAP: Record<StatColor, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-50 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
}

function StatCard({
    icon: Icon,
    label,
    value,
    subtitle,
    color = 'slate',
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string | number
    subtitle?: string
    color?: StatColor
}) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-start justify-between">
                <div className={cn('p-2 rounded-lg', COLOR_MAP[color])}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-3">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
    )
}

function npsScoreColor(score: number | null): StatColor {
    if (score === null) return 'slate'
    if (score >= 50) return 'emerald'
    if (score >= 0) return 'indigo'
    if (score >= -50) return 'amber'
    return 'rose'
}

function segmentOf(score: number): { label: string; container: string; badge: string } {
    if (score >= 9) {
        return {
            label: 'Promotor',
            container: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            badge: 'bg-emerald-100 text-emerald-700',
        }
    }
    if (score >= 7) {
        return {
            label: 'Passivo',
            container: 'bg-amber-50 text-amber-700 border-amber-200',
            badge: 'bg-amber-100 text-amber-700',
        }
    }
    return {
        label: 'Detrator',
        container: 'bg-rose-50 text-rose-700 border-rose-200',
        badge: 'bg-rose-100 text-rose-700',
    }
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso)
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d)
    } catch {
        return iso
    }
}

function NPSEmptyState({ kpis }: { kpis: NPSKpis | undefined }) {
    const hasSurveysSent = (kpis?.sent ?? 0) > 0
    return (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-slate-200 rounded-xl">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Smile className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2 tracking-tight">
                {hasSurveysSent ? 'Nenhuma resposta ainda' : 'NPS ainda não configurado'}
            </h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
                {hasSurveysSent
                    ? 'As pesquisas já foram enviadas. Quando os clientes responderem, elas aparecem aqui.'
                    : 'O envio automático de pesquisas será ativado em breve. As respostas chegam por webhook e aparecem nesta página.'}
            </p>
        </div>
    )
}

function NPSResponseCard({
    row,
    onOpenCard,
}: {
    row: NPSResponseRow
    onOpenCard: (cardId: string) => void
}) {
    const segment = segmentOf(row.score)
    const hasCard = row.card_id !== null
    const headerLabel = row.card_titulo || row.original_name || row.contato_nome || 'Resposta sem card vinculado'
    const subLabel = row.card_titulo
        ? row.contato_nome
        : row.contato_nome && row.contato_nome !== row.card_titulo
            ? row.contato_nome
            : null

    return (
        <div
            onClick={hasCard ? () => onOpenCard(row.card_id!) : undefined}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-200',
                hasCard
                    ? 'hover:shadow-md hover:border-indigo-200 cursor-pointer'
                    : 'cursor-default'
            )}
        >
            <div className="p-4 flex items-start gap-4">
                <div className={cn('flex flex-col items-center justify-center w-14 h-14 rounded-xl border', segment.container)}>
                    <span className="text-2xl font-bold leading-none tracking-tight">{row.score}</span>
                    <span className="text-[10px] font-medium opacity-80 mt-0.5">/10</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                            <h3 className="font-medium text-slate-900 truncate">
                                {headerLabel}
                            </h3>
                            {subLabel && (
                                <p className="text-xs text-slate-500 mt-0.5">{subLabel}</p>
                            )}
                            {!hasCard && (
                                <p className="text-xs text-slate-400 mt-0.5 italic">Sem card vinculado</p>
                            )}
                        </div>
                        <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', segment.badge)}>
                            {segment.label}
                        </span>
                    </div>

                    {row.comment && (
                        <p className="text-sm text-slate-600 line-clamp-2 mt-2">
                            “{row.comment}”
                        </p>
                    )}

                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                        <span>{formatDate(row.responded_at)}</span>
                        {row.channel && row.channel !== 'unknown' && (
                            <span className="capitalize">via {row.channel}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function NPSPage() {
    const navigate = useNavigate()
    const { data: kpis, isLoading: loadingKpis } = useNPSKpis()
    const { data: responses = [], isLoading: loadingList } = useNPSResponses()

    const npsScoreDisplay = kpis?.npsScore === null || kpis?.npsScore === undefined ? '—' : kpis.npsScore
    const subtitleSegments =
        kpis && kpis.responded > 0
            ? `${kpis.promoters} promotores · ${kpis.passives} passivos · ${kpis.detractors} detratores`
            : 'promotores − detratores'

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            <div className="p-6 max-w-[1400px] mx-auto">
                <AdminPageHeader
                    title="NPS"
                    subtitle="Satisfação dos clientes — pesquisas enviadas, respostas recebidas e score consolidado"
                    icon={<Smile className="w-5 h-5" />}
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        icon={Send}
                        label="Pesquisas enviadas"
                        value={loadingKpis ? '—' : kpis?.sent ?? 0}
                        color="slate"
                    />
                    <StatCard
                        icon={MessageSquare}
                        label="Respostas recebidas"
                        value={loadingKpis ? '—' : kpis?.responded ?? 0}
                        color="indigo"
                    />
                    <StatCard
                        icon={Percent}
                        label="Taxa de resposta"
                        value={loadingKpis ? '—' : `${kpis?.responseRate ?? 0}%`}
                        color="blue"
                    />
                    <StatCard
                        icon={Gauge}
                        label="NPS Score"
                        value={loadingKpis ? '—' : npsScoreDisplay}
                        subtitle={subtitleSegments}
                        color={npsScoreColor(kpis?.npsScore ?? null)}
                    />
                </div>

                {loadingList ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    </div>
                ) : responses.length === 0 ? (
                    <NPSEmptyState kpis={kpis} />
                ) : (
                    <div className="space-y-3">
                        {responses.map((row) => (
                            <NPSResponseCard
                                key={row.id}
                                row={row}
                                onOpenCard={(cardId) => navigate(`/cards/${cardId}`)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
