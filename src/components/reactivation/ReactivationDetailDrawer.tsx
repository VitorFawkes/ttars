import { X, MapPin, Calendar, DollarSign, TrendingUp, Clock, Users, MessageCircle, Gift, Star, Cake } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactivationPattern } from '@/hooks/useReactivationPatterns'

interface Props {
    pattern: ReactivationPattern | null
    onClose: () => void
}

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = Math.min((value / max) * 100, 100)
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium text-slate-600 w-8 text-right">{value}</span>
        </div>
    )
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(value: number | null): string {
    if (!value) return '-'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export default function ReactivationDetailDrawer({ pattern, onClose }: Props) {
    if (!pattern) return null

    const contact = pattern.contato
    const breakdown = pattern.score_breakdown
    const days = pattern.days_until_ideal_contact

    const urgencyLabel = days === null ? 'Sem previsao' :
        days < 0 ? `Atrasado ${Math.abs(days)} dias` :
            days <= 30 ? `Em ${days} dias` :
                `Em ${days} dias`

    const urgencyColor = days === null ? 'text-slate-400' :
        days < 0 ? 'text-red-600' :
            days <= 30 ? 'text-amber-600' :
                'text-emerald-600'

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                            {contact?.nome} {contact?.sobrenome}
                        </h2>
                        <p className="text-sm text-slate-400">{contact?.email}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Score */}
                    <div className="bg-slate-50 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-slate-500">Score de Reativacao</span>
                            <span className={cn(
                                'text-3xl font-bold tracking-tight',
                                (pattern.reactivation_score ?? 0) >= 80 ? 'text-emerald-600' :
                                    (pattern.reactivation_score ?? 0) >= 60 ? 'text-amber-600' : 'text-slate-500'
                            )}>
                                {pattern.reactivation_score ?? '-'}
                                <span className="text-sm font-normal text-slate-400">/100</span>
                            </span>
                        </div>
                        {breakdown && (
                            <div className="space-y-2">
                                <ScoreBar label="Frequencia" value={breakdown.frequency} max={25} color="bg-indigo-500" />
                                <ScoreBar label="Recencia" value={breakdown.recency} max={20} color="bg-blue-500" />
                                <ScoreBar label="Valor" value={breakdown.value} max={30} color="bg-emerald-500" />
                                <ScoreBar label="Sazonalidade" value={breakdown.seasonality} max={15} color="bg-amber-500" />
                                {breakdown.timing > 0 && (
                                    <ScoreBar label="Timing" value={breakdown.timing} max={5} color="bg-orange-500" />
                                )}
                                {breakdown.interest > 0 && (
                                    <ScoreBar label="Interesse recente" value={breakdown.interest} max={10} color="bg-red-500" />
                                )}
                                {breakdown.engagement > 0 && (
                                    <ScoreBar label="Engajamento" value={breakdown.engagement} max={15} color="bg-purple-500" />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Janela de Contato */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            Janela de Contato
                        </h3>
                        <p className={cn('text-xl font-bold mb-1', urgencyColor)}>{urgencyLabel}</p>
                        {pattern.ideal_contact_date && (
                            <p className="text-sm text-slate-500">
                                Data ideal: {formatDate(pattern.ideal_contact_date)}
                            </p>
                        )}
                        {pattern.predicted_next_trip_start && (
                            <p className="text-sm text-slate-400 mt-1">
                                Viagem prevista: {formatDate(pattern.predicted_next_trip_start)}
                                {pattern.predicted_next_trip_end && ` - ${formatDate(pattern.predicted_next_trip_end)}`}
                            </p>
                        )}
                        {pattern.prediction_confidence !== null && (
                            <p className="text-xs text-slate-400 mt-1">
                                Confianca: {(pattern.prediction_confidence * 100).toFixed(0)}%
                            </p>
                        )}
                    </div>

                    {/* Padrão de Viagem */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-slate-400" />
                            Padrao de Viagem
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-slate-400">Frequencia</p>
                                <p className="text-sm font-medium text-slate-700">
                                    {pattern.travel_frequency_per_year
                                        ? `${pattern.travel_frequency_per_year.toFixed(1)}x/ano`
                                        : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Total de viagens</p>
                                <p className="text-sm font-medium text-slate-700">{pattern.total_completed_trips}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Intervalo medio</p>
                                <p className="text-sm font-medium text-slate-700">
                                    {pattern.avg_days_between_trips ? `${pattern.avg_days_between_trips} dias` : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Duracao media</p>
                                <p className="text-sm font-medium text-slate-700">
                                    {pattern.preferred_duration_days ? `${pattern.preferred_duration_days} dias` : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Lead time booking</p>
                                <p className="text-sm font-medium text-slate-700">
                                    {pattern.typical_booking_lead_days ? `${pattern.typical_booking_lead_days} dias` : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Ultima viagem</p>
                                <p className="text-sm font-medium text-slate-700">
                                    {pattern.days_since_last_trip ? `${pattern.days_since_last_trip} dias atras` : '-'}
                                </p>
                            </div>
                        </div>

                        {/* Sazonalidade */}
                        {pattern.peak_months && pattern.peak_months.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> Meses preferidos
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {pattern.peak_months.map(m => (
                                        <span key={m} className="px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-full">
                                            {MONTH_NAMES[m]}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Valor */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-slate-400" />
                            Valor
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-slate-400">Valor medio</p>
                                <p className="text-sm font-bold text-slate-700">{formatCurrency(pattern.avg_trip_value)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Receita total</p>
                                <p className="text-sm font-bold text-slate-700">{formatCurrency(pattern.total_revenue)}</p>
                            </div>
                        </div>
                        {pattern.is_high_value && (
                            <p className="mt-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md inline-block">
                                Cliente de alto valor
                            </p>
                        )}
                    </div>

                    {/* Destinos */}
                    {pattern.last_destinations && pattern.last_destinations.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                Ultimos Destinos
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {pattern.last_destinations.map((d, i) => (
                                    <span key={i} className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
                                        {d}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Relacionamento */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Star className="w-4 h-4 text-slate-400" />
                            Relacionamento
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            {/* Aniversário */}
                            {pattern.birthday_date && (
                                <div className="flex items-start gap-2">
                                    <Cake className="w-4 h-4 text-pink-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-slate-400">Aniversario</p>
                                        <p className="text-sm font-medium text-slate-700">
                                            {formatDate(pattern.birthday_date)}
                                        </p>
                                        {pattern.days_until_birthday !== null && (
                                            <p className={cn(
                                                'text-xs font-medium mt-0.5',
                                                pattern.days_until_birthday <= 30 ? 'text-pink-600' : 'text-slate-400'
                                            )}>
                                                {pattern.days_until_birthday <= 30
                                                    ? `Em ${pattern.days_until_birthday} dias!`
                                                    : `Em ${pattern.days_until_birthday} dias`}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Última interação */}
                            <div className="flex items-start gap-2">
                                <MessageCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-400">Ultima interacao</p>
                                    {pattern.last_interaction_date ? (
                                        <>
                                            <p className="text-sm font-medium text-slate-700">
                                                {pattern.days_since_interaction !== null
                                                    ? `${pattern.days_since_interaction} dias atras`
                                                    : formatDate(pattern.last_interaction_date)}
                                            </p>
                                            <p className="text-xs text-slate-400 capitalize">
                                                via {pattern.last_interaction_type}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-slate-400">Sem registro</p>
                                    )}
                                </div>
                            </div>

                            {/* Indicações */}
                            {pattern.referral_count > 0 && (
                                <div className="flex items-start gap-2">
                                    <Users className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-slate-400">Indicacoes feitas</p>
                                        <p className="text-sm font-bold text-emerald-600">
                                            {pattern.referral_count} {pattern.referral_count === 1 ? 'cliente' : 'clientes'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Presentes */}
                            <div className="flex items-start gap-2">
                                <Gift className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-400">Presentes</p>
                                    {pattern.gifts_sent_count > 0 ? (
                                        <>
                                            <p className="text-sm font-medium text-slate-700">
                                                {pattern.gifts_sent_count} enviado{pattern.gifts_sent_count > 1 ? 's' : ''}
                                            </p>
                                            {pattern.last_gift_date && (
                                                <p className="text-xs text-slate-400">
                                                    Ultimo: {formatDate(pattern.last_gift_date)}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-sm text-amber-600 font-medium">Nenhum enviado</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Acompanhantes frequentes */}
                    {pattern.companion_names && pattern.companion_names.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                <Users className="w-4 h-4 text-slate-400" />
                                Viaja com ({pattern.companion_count} {pattern.companion_count === 1 ? 'pessoa' : 'pessoas'})
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {pattern.companion_names.map((name, i) => (
                                    <span key={i} className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                                        {name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
