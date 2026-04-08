import { useNavigate } from 'react-router-dom'
import { X, Phone, MapPin, Calendar, TrendingUp, Clock, Users, MessageCircle, Gift, Cake, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import type { ReactivationPattern } from '@/hooks/useReactivationPatterns'

interface Props {
    pattern: ReactivationPattern | null
    onClose: () => void
}

interface ContactCard {
    id: string
    titulo: string
    status_comercial: string
    data_viagem_inicio: string | null
}

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    if (value === 0) return null
    const pct = Math.min((value / max) * 100, 100)
    return (
        <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 w-28 flex-shrink-0 text-right">{label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-6 text-right tabular-nums">{value}</span>
        </div>
    )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
    return (
        <div>
            <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
            <p className={cn('text-sm font-semibold', accent || 'text-slate-800')}>{value}</p>
            {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    )
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(v: number | null): string {
    if (!v) return '-'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function statusColor(s: string) {
    if (s === 'ganho') return 'bg-emerald-50 text-emerald-700'
    if (s === 'perdido') return 'bg-red-50 text-red-600'
    return 'bg-blue-50 text-blue-700'
}

export default function ReactivationDetailDrawer({ pattern, onClose }: Props) {
    const navigate = useNavigate()
    const [cards, setCards] = useState<ContactCard[]>([])

    useEffect(() => {
        if (!pattern) return
        supabase
            .from('cards')
            .select('id, titulo, status_comercial, data_viagem_inicio')
            .eq('pessoa_principal_id', pattern.contact_id)
            .order('created_at', { ascending: false })
            .limit(8)
            .then(({ data }) => setCards((data as ContactCard[]) ?? []))
    }, [pattern?.contact_id])

    if (!pattern) return null

    const ct = pattern.contato
    const bd = pattern.score_breakdown
    const days = pattern.days_until_ideal_contact

    const urgency = days === null ? { label: 'Sem previsão', cls: 'text-slate-400' } :
        days < 0 ? { label: `Atrasado ${Math.abs(days)} dias`, cls: 'text-red-600' } :
            days <= 30 ? { label: `Em ${days} dias`, cls: 'text-amber-600' } :
                { label: `Em ${days} dias`, cls: 'text-emerald-600' }

    const whatsappUrl = ct?.telefone
        ? `https://wa.me/55${ct.telefone.replace(/\D/g, '')}`
        : null

    return (
        <>
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />

            <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-white shadow-2xl z-50 flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 border-b border-slate-200 px-5 py-4">
                    <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">
                                {ct?.nome} {ct?.sobrenome}
                            </h2>
                            <p className="text-xs text-slate-400 truncate">{ct?.email}</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 -mr-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Ações principais */}
                    <div className="flex gap-2">
                        {whatsappUrl && (
                            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                                <Phone className="w-3.5 h-3.5" />
                                WhatsApp
                            </a>
                        )}
                        <button
                            onClick={() => { onClose(); navigate(`/people?search=${encodeURIComponent(ct?.nome ?? '')}`) }}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Ver perfil
                        </button>
                    </div>
                </div>

                {/* Conteúdo scrollável */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-5 space-y-5">

                        {/* Score + Janela lado a lado */}
                        <div className="flex gap-3">
                            <div className="flex-1 bg-slate-50 rounded-xl p-4 text-center">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Score</p>
                                <p className={cn(
                                    'text-3xl font-bold tracking-tight',
                                    (pattern.reactivation_score ?? 0) >= 75 ? 'text-emerald-600' :
                                        (pattern.reactivation_score ?? 0) >= 50 ? 'text-amber-600' : 'text-slate-500'
                                )}>
                                    {pattern.reactivation_score ?? '-'}
                                </p>
                            </div>
                            <div className="flex-1 bg-slate-50 rounded-xl p-4 text-center">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                    <Clock className="w-3 h-3 inline mr-1" />Janela
                                </p>
                                <p className={cn('text-lg font-bold', urgency.cls)}>{urgency.label}</p>
                                {pattern.ideal_contact_date && (
                                    <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(pattern.ideal_contact_date)}</p>
                                )}
                            </div>
                        </div>

                        {/* Score breakdown compacto */}
                        {bd && (
                            <div className="space-y-1.5">
                                <ScoreBar label="Frequência" value={bd.frequency} max={20} color="bg-indigo-400" />
                                <ScoreBar label="Recência" value={bd.recency} max={20} color="bg-blue-400" />
                                <ScoreBar label="Valor" value={bd.value} max={20} color="bg-emerald-400" />
                                <ScoreBar label="Sazonalidade" value={bd.seasonality} max={10} color="bg-amber-400" />
                                <ScoreBar label="Timing" value={bd.timing} max={5} color="bg-orange-400" />
                                <ScoreBar label="Interesse" value={bd.interest} max={10} color="bg-red-400" />
                                <ScoreBar label="Engajamento" value={bd.engagement} max={15} color="bg-purple-400" />
                            </div>
                        )}

                        {/* Viagens do contato */}
                        {cards.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Viagens ({cards.length})
                                </h3>
                                <div className="space-y-1.5">
                                    {cards.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { onClose(); navigate(`/cards/${c.id}`) }}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 hover:bg-indigo-50 text-left transition-colors group"
                                        >
                                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', statusColor(c.status_comercial))}>
                                                {c.status_comercial === 'ganho' ? 'Ganho' : c.status_comercial === 'perdido' ? 'Perdido' : 'Aberto'}
                                            </span>
                                            <span className="text-sm text-slate-700 truncate flex-1 group-hover:text-indigo-700">{c.titulo}</span>
                                            <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-500 flex-shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Padrão de viagem */}
                        <div>
                            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <TrendingUp className="w-3 h-3" /> Padrão de viagem
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                <Stat label="Frequência" value={pattern.travel_frequency_per_year ? `${pattern.travel_frequency_per_year.toFixed(1)}x/ano` : '-'} />
                                <Stat label="Última viagem" value={pattern.days_since_last_trip ? `${pattern.days_since_last_trip}d atrás` : '-'} />
                                <Stat label="Duração média" value={pattern.preferred_duration_days ? `${pattern.preferred_duration_days}d` : '-'} />
                                <Stat label="Intervalo" value={pattern.avg_days_between_trips ? `${pattern.avg_days_between_trips}d` : '-'} />
                                <Stat label="Lead time" value={pattern.typical_booking_lead_days ? `${pattern.typical_booking_lead_days}d` : '-'} />
                                <Stat label="Total" value={`${pattern.total_completed_trips} viagens`} />
                            </div>

                            {pattern.peak_months && pattern.peak_months.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-100">
                                    <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> Meses preferidos
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {pattern.peak_months.map(m => (
                                            <span key={m} className="px-2 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-600 rounded-full">
                                                {MONTH_NAMES[m]}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Valor + Destinos */}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Valor</h3>
                                <Stat label="Ticket médio" value={formatCurrency(pattern.avg_trip_value)}
                                    accent={pattern.is_high_value ? 'text-emerald-600' : undefined} />
                                <div className="mt-2">
                                    <Stat label="Receita total" value={formatCurrency(pattern.total_revenue)} />
                                </div>
                            </div>
                            {pattern.last_destinations && pattern.last_destinations.length > 0 && (
                                <div className="flex-1">
                                    <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> Destinos
                                    </h3>
                                    <div className="flex flex-wrap gap-1">
                                        {pattern.last_destinations.map((d, i) => (
                                            <span key={i} className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded-full">{d}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Relacionamento */}
                        <div>
                            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Relacionamento</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {pattern.birthday_date && (
                                    <div className="flex items-start gap-2">
                                        <Cake className="w-3.5 h-3.5 text-pink-400 mt-0.5 flex-shrink-0" />
                                        <Stat label="Aniversário" value={formatDate(pattern.birthday_date)}
                                            sub={pattern.days_until_birthday !== null && pattern.days_until_birthday >= 0
                                                ? `Em ${pattern.days_until_birthday} dias` : undefined}
                                            accent={pattern.days_until_birthday !== null && pattern.days_until_birthday <= 30 ? 'text-pink-600' : undefined} />
                                    </div>
                                )}
                                <div className="flex items-start gap-2">
                                    <MessageCircle className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                                    <Stat
                                        label="Última interação"
                                        value={pattern.days_since_interaction !== null ? `${pattern.days_since_interaction}d atrás` : 'Sem registro'}
                                        sub={pattern.last_interaction_type ? `via ${pattern.last_interaction_type}` : undefined}
                                    />
                                </div>
                                <div className="flex items-start gap-2">
                                    <Gift className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                    <Stat
                                        label="Presentes"
                                        value={pattern.gifts_sent_count > 0 ? `${pattern.gifts_sent_count} enviado${pattern.gifts_sent_count > 1 ? 's' : ''}` : 'Nenhum'}
                                        sub={pattern.last_gift_date ? `Último: ${formatDate(pattern.last_gift_date)}` : undefined}
                                        accent={pattern.gifts_sent_count === 0 ? 'text-amber-600' : undefined}
                                    />
                                </div>
                                {pattern.referral_count > 0 && (
                                    <div className="flex items-start gap-2">
                                        <Users className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                                        <Stat label="Indicações" value={`${pattern.referral_count} clientes`} accent="text-emerald-600" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Acompanhantes */}
                        {pattern.companion_names && pattern.companion_names.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Users className="w-3 h-3" /> Viaja com ({pattern.companion_count})
                                </h3>
                                <div className="flex flex-wrap gap-1">
                                    {pattern.companion_names.map((n, i) => (
                                        <span key={i} className="px-2 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-full">{n}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
