import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Plane, MapPin, CheckCircle, PackageCheck, AlertTriangle,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useOperationsData } from '@/hooks/analytics/useOperationsData'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface ReadinessRow {
    id: string
    titulo: string
    data_viagem_inicio: string
    data_viagem_fim: string
    estado_operacional: string
    pos_owner_nome: string
    prods_total: number
    prods_ready: number
    status_comercial: string
}

interface GiftOverdue {
    id: string
    contato: { nome: string } | null
    scheduled_ship_date: string
}

interface GiftStats {
    pending: number
    overdue: GiftOverdue[]
}

function daysUntil(dateStr: string, now: number): number {
    const diff = new Date(dateStr).getTime() - now
    return Math.ceil(diff / 86400000)
}

function ProductDots({ ready, total }: { ready: number; total: number }) {
    if (total === 0) return <span className="text-xs text-slate-400">—</span>
    return (
        <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
                {Array.from({ length: total }, (_, i) => (
                    <div
                        key={i}
                        className={cn(
                            'w-2.5 h-2.5 rounded-full',
                            i < ready ? 'bg-emerald-500' : 'bg-slate-200'
                        )}
                    />
                ))}
            </div>
            <span className="text-xs text-slate-500 ml-1">{ready}/{total}</span>
        </div>
    )
}

function DaysUntilBadge({ days }: { days: number }) {
    const label = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days}d`
    const color = days < 3 ? 'bg-red-100 text-red-700' : days < 7 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
    return (
        <span className={cn('text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap', color)}>
            {label}
        </span>
    )
}

export default function OperationsView() {
    const navigate = useNavigate()
    const { setActiveView, product } = useAnalyticsFilters()
    const { data: ops, isLoading, error: opsError, refetch } = useOperationsData()
    const [now] = useState(() => Date.now())

    useEffect(() => {
        setActiveView('operations')
    }, [setActiveView])

    const readiness = useQuery({
        queryKey: ['analytics', 'operations-readiness', product],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('view_cards_acoes')
                .select('id, titulo, data_viagem_inicio, estado_operacional, pos_owner_nome, prods_total, prods_ready, status_comercial')
                .eq('status_comercial', 'ganho')
                .not('estado_operacional', 'in', '("realizada","cancelada")')
                .eq('produto', product as 'TRIPS')
                .is('deleted_at', null)
                .is('archived_at', null)
                .not('data_viagem_inicio', 'is', null)
                .order('data_viagem_inicio', { ascending: true })
                .limit(50)
            if (error) throw error
            return (data || []) as unknown as ReadinessRow[]
        },
        staleTime: 2 * 60 * 1000,
    })

    const giftStats = useQuery({
        queryKey: ['analytics', 'gift-stats'],
        queryFn: async () => {
            const today = new Date().toISOString().split('T')[0]

            const [pendingRes, overdueRes] = await Promise.all([
                supabase.from('card_gift_assignments')
                    .select('id', { count: 'exact', head: true })
                    .in('status', ['pendente', 'preparando']),
                supabase.from('card_gift_assignments')
                    .select('id, contato:contato_id(nome), scheduled_ship_date')
                    .in('status', ['pendente', 'preparando'])
                    .lt('scheduled_ship_date', today)
                    .order('scheduled_ship_date', { ascending: true })
                    .limit(10),
            ])

            return {
                pending: pendingRes.count ?? 0,
                overdue: overdueRes.data || [],
            } as GiftStats
        },
        staleTime: 2 * 60 * 1000,
    })

    const readinessTrips = useMemo(() => readiness.data || [], [readiness.data])

    const departingSoon = useMemo(() => {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
        return readinessTrips.filter(t => {
            const dept = new Date(t.data_viagem_inicio).getTime()
            return dept > now && dept <= now + sevenDaysMs
        })
    }, [readinessTrips, now])

    const inProgress = useMemo(() => {
        return readinessTrips.filter(t => {
            const start = new Date(t.data_viagem_inicio).getTime()
            const end = t.data_viagem_fim ? new Date(t.data_viagem_fim).getTime() : start + 7 * 86400000
            return start <= now && now <= end
        })
    }, [readinessTrips, now])

    const readinessPercent = useMemo(() => {
        if (readinessTrips.length === 0) return 100
        const totalProds = readinessTrips.reduce((a, t) => a + t.prods_total, 0)
        if (totalProds === 0) return 100
        const readyProds = readinessTrips.reduce((a, t) => a + t.prods_ready, 0)
        return Math.round(readyProds / totalProds * 100)
    }, [readinessTrips])

    const delivered = useMemo(() => {
        return readinessTrips.filter(t => t.estado_operacional === 'realizada').length
    }, [readinessTrips])

    const pendingProductsIn48h = useMemo(() => {
        const fortyEightHours = 48 * 60 * 60 * 1000
        return readinessTrips.filter(t => {
            const dept = new Date(t.data_viagem_inicio).getTime()
            const hasOffTrack = t.prods_ready < t.prods_total
            return hasOffTrack && dept > now && dept <= now + fortyEightHours
        })
    }, [readinessTrips, now])

    const overdueGifts = useMemo(() => {
        return giftStats.data?.overdue || []
    }, [giftStats.data])

    const hasAlerts = pendingProductsIn48h.length > 0 || overdueGifts.length > 0

    const readinessIsHealthy = readinessPercent >= 80

    return (
        <div className="space-y-6">
            {opsError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados operacionais"
                    onRetry={() => refetch()}
                />
            )}

            {/* Zone 1: Alert Banner */}
            {hasAlerts && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                    {pendingProductsIn48h.length > 0 && (
                        <div className="flex items-center gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span className="text-amber-900">
                                <span className="font-semibold">{pendingProductsIn48h.length}</span>
                                {' '}
                                viagens embarcam em 48h com produtos pendentes
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    document.getElementById('readiness-section')?.scrollIntoView({ behavior: 'smooth' })
                                }}
                                className="ml-auto text-amber-600 hover:text-amber-700 font-medium text-xs"
                            >
                                Ver
                            </button>
                        </div>
                    )}
                    {overdueGifts.length > 0 && (
                        <div className="flex items-center gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span className="text-amber-900">
                                <span className="font-semibold">{overdueGifts.length}</span>
                                {' '}
                                presentes atrasados
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    document.getElementById('gifts-section')?.scrollIntoView({ behavior: 'smooth' })
                                }}
                                className="ml-auto text-amber-600 hover:text-amber-700 font-medium text-xs"
                            >
                                Ver
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Zone 2: KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
                <KpiCard
                    title="Embarques próximos (7d)"
                    value={departingSoon.length}
                    icon={Plane}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading || readiness.isLoading}
                />
                <KpiCard
                    title="Em andamento"
                    value={inProgress.length}
                    icon={MapPin}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={isLoading || readiness.isLoading}
                />
                <KpiCard
                    title="Readiness"
                    value={`${readinessPercent}%`}
                    icon={CheckCircle}
                    color={readinessIsHealthy ? 'text-emerald-600' : 'text-rose-600'}
                    bgColor={readinessIsHealthy ? 'bg-emerald-50' : 'bg-rose-50'}
                    isLoading={isLoading || readiness.isLoading}
                />
                <KpiCard
                    title="Entregues (período)"
                    value={delivered}
                    icon={PackageCheck}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={isLoading || readiness.isLoading}
                />
            </div>

            {/* Zone 3: Readiness Table */}
            <ChartCard
                title="Readiness por Viagem"
                isLoading={isLoading || readiness.isLoading}
            >
                <div id="readiness-section" className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Viagem</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-500">Embarque</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-500">Produtos</th>
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Responsável</th>
                            </tr>
                        </thead>
                        <tbody>
                            {readiness.isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={4} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : readinessTrips.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        Nenhuma viagem em andamento ou planejada
                                    </td>
                                </tr>
                            ) : (
                                readinessTrips.map((trip) => {
                                    const days = daysUntil(trip.data_viagem_inicio, now)
                                    const isOffTrack = trip.prods_ready < trip.prods_total && days < 7
                                    return (
                                        <tr
                                            key={trip.id}
                                            className={cn(
                                                'border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer',
                                                isOffTrack && 'bg-rose-50/50 border-l-2 border-l-rose-400'
                                            )}
                                            onClick={() => navigate(`/card/${trip.id}`)}
                                        >
                                            <td className="px-6 py-3 font-medium text-indigo-600 hover:text-indigo-700">{trip.titulo}</td>
                                            <td className="px-4 py-3">
                                                <DaysUntilBadge days={days} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <ProductDots ready={trip.prods_ready} total={trip.prods_total} />
                                            </td>
                                            <td className="px-6 py-3 text-slate-600">{trip.pos_owner_nome || '—'}</td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </ChartCard>

            {/* Zone 4: Bottom panels */}
            <div className="grid grid-cols-2 gap-4">
                {/* Left: Sub-cards/Mudanças */}
                <ChartCard
                    title="Mudanças (Sub-cards)"
                    isLoading={isLoading}
                >
                    <div className="px-4 pb-4">
                        <div className="mb-4">
                            <p className="text-sm text-slate-600">
                                <span className="font-medium text-slate-900">{ops?.sub_card_stats?.total_sub_cards ?? 0}</span>
                                {' '}
                                ativos
                                {' '}
                                <span className="text-slate-400">|</span>
                                {' '}
                                <span className="font-medium text-slate-900">{(ops?.sub_card_stats?.changes_per_trip ?? 0).toFixed(1)}</span>
                                {' '}
                                por viagem
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50">
                                        <th className="text-left px-4 py-2 font-medium text-slate-500">Planner</th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-500">Viagens</th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-500">Mudanças</th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-500">Itens/Viagem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!isLoading && (ops?.per_planner || []).length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-4 text-center text-slate-400 text-xs">
                                                Sem dados
                                            </td>
                                        </tr>
                                    ) : (
                                        (ops?.per_planner || []).slice(0, 5).map((p) => (
                                            <tr key={p.planner_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <td className="px-4 py-2 text-slate-800">{p.planner_nome}</td>
                                                <td className="text-right px-4 py-2 text-slate-600">{p.viagens}</td>
                                                <td className="text-right px-4 py-2 text-orange-600 font-medium">{p.mudancas}</td>
                                                <td className="text-right px-4 py-2 text-slate-600">{p.mudancas_por_viagem.toFixed(1)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </ChartCard>

                {/* Right: Gifts */}
                <ChartCard
                    title="Presentes"
                    isLoading={giftStats.isLoading}
                >
                    <div id="gifts-section" className="px-4 pb-4">
                        <div className="mb-4">
                            <p className="text-sm text-slate-600">
                                <span className="font-medium text-slate-900">{giftStats.data?.pending ?? 0}</span>
                                {' '}
                                pendentes
                                {giftStats.data && giftStats.data.overdue.length > 0 && (
                                    <>
                                        {' '}
                                        <span className="text-slate-400">|</span>
                                        {' '}
                                        <span className={cn(
                                            'font-medium',
                                            giftStats.data.overdue.length > 0 ? 'text-rose-600' : 'text-slate-900'
                                        )}>
                                            {giftStats.data.overdue.length}
                                        </span>
                                        {' '}
                                        <span className={giftStats.data.overdue.length > 0 ? 'text-rose-600' : 'text-slate-600'}>
                                            atrasados
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                        {!giftStats.isLoading && overdueGifts.length > 0 ? (
                            <div className="space-y-2">
                                {overdueGifts.map((gift) => {
                                    const daysOverdue = Math.floor((now - new Date(gift.scheduled_ship_date).getTime()) / 86400000)
                                    return (
                                        <div key={gift.id} className="bg-rose-50/50 border-l-2 border-l-rose-400 px-3 py-2 rounded text-xs">
                                            <p className="font-medium text-rose-900">{gift.contato?.nome || 'Contato desconhecido'}</p>
                                            <p className="text-rose-700">{daysOverdue}d atrasado</p>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="py-6 text-center text-slate-400 text-xs">
                                {giftStats.isLoading ? 'Carregando...' : 'Nenhum presente atrasado'}
                            </div>
                        )}
                    </div>
                </ChartCard>
            </div>
        </div>
    )
}
