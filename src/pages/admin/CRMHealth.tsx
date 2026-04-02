import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, Clock, CalendarX, ArrowRight, Activity, Wifi, Bot } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Database } from '../../database.types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useHealthAlerts } from '@/hooks/useIntegrationHealth'
import IntegrationHealthTab from '@/components/admin/health/IntegrationHealthTab'
import JuliaIAConfig from '@/components/admin/JuliaIAConfig'
import { useProductContext } from '@/hooks/useProductContext'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

export default function CRMHealth() {
    const [searchParams] = useSearchParams()
    const tabParam = searchParams.get('tab')
    const defaultTab = tabParam === 'integrations' ? 'integrations' : tabParam === 'julia' ? 'julia' : 'operational'
    const { currentProduct } = useProductContext()

    const { data: cards, isLoading } = useQuery({
        queryKey: ['crm-health-cards', currentProduct],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('view_cards_acoes')
                .select('*')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .eq('produto', currentProduct as any)
                .neq('phase_slug', 'pos_venda')
                .neq('status_comercial', 'perdido')
                .neq('status_comercial', 'ganho')

            if (error) throw error
            return data as Card[]
        }
    })

    const { data: alerts } = useHealthAlerts(false)
    const activeAlertCount = alerts?.filter(a => a.status === 'active').length ?? 0

    const overdueCards = cards?.filter(c => Number(c.urgencia_tempo_etapa) === 1) || []
    const stagnantCards = cards?.filter(c => (c.tempo_sem_contato || 0) > 7) || []
    const noTaskCards = cards?.filter(c => !c.proxima_tarefa) || []
    const healthScore = cards?.length ? Math.round(100 - (((overdueCards.length + noTaskCards.length) / (cards.length * 2)) * 100)) : 100

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Saude do CRM</h1>
                    <p className="text-muted-foreground">Diagnostico operacional e monitoramento de integracoes</p>
                </div>
                <div className={`px-4 py-2 rounded-lg font-bold text-xl ${healthScore > 80 ? 'bg-emerald-100 text-emerald-700' :
                    healthScore > 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>
                    Score: {healthScore}/100
                </div>
            </div>

            <Tabs defaultValue={defaultTab} className="space-y-6">
                <TabsList className="bg-slate-100 p-1 rounded-lg">
                    <TabsTrigger value="operational" className="gap-2 text-sm">
                        <Activity className="w-4 h-4" />
                        Operacional
                    </TabsTrigger>
                    <TabsTrigger value="integrations" className="gap-2 text-sm">
                        <Wifi className="w-4 h-4" />
                        Integracoes
                        {activeAlertCount > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
                                {activeAlertCount}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="julia" className="gap-2 text-sm">
                        <Bot className="w-4 h-4" />
                        Julia IA
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="operational">
                    {isLoading ? (
                        <div className="py-8 text-muted-foreground">Carregando diagnostico...</div>
                    ) : (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <HealthCard
                                    title="Atrasados (SLA)"
                                    count={overdueCards.length}
                                    icon={Clock}
                                    color="red"
                                    description="Cards que estouraram o tempo limite da etapa."
                                />
                                <HealthCard
                                    title="Sem Tarefa Futura"
                                    count={noTaskCards.length}
                                    icon={CalendarX}
                                    color="orange"
                                    description="Cards sem proximo passo definido."
                                />
                                <HealthCard
                                    title="Estagnados (>7 dias)"
                                    count={stagnantCards.length}
                                    icon={AlertTriangle}
                                    color="yellow"
                                    description="Sem atualizacao ou contato ha mais de uma semana."
                                />
                            </div>

                            <div className="space-y-6">
                                <h2 className="text-lg font-semibold text-foreground">Atencao Necessaria</h2>

                                {overdueCards.length > 0 && (
                                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                                        <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-red-600" />
                                            <h3 className="font-medium text-red-900">SLA Estourado ({overdueCards.length})</h3>
                                        </div>
                                        <div className="divide-y divide-border">
                                            {overdueCards.slice(0, 5).map(card => (
                                                <CardRow key={card.id} card={card} reason="Tempo na etapa excedido" />
                                            ))}
                                            {overdueCards.length > 5 && (
                                                <div className="p-3 text-center text-sm text-muted-foreground">
                                                    + {overdueCards.length - 5} outros cards
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {noTaskCards.length > 0 && (
                                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                                        <div className="p-4 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                                            <CalendarX className="w-5 h-5 text-orange-600" />
                                            <h3 className="font-medium text-orange-900">Sem Proxima Tarefa ({noTaskCards.length})</h3>
                                        </div>
                                        <div className="divide-y divide-border">
                                            {noTaskCards.slice(0, 5).map(card => (
                                                <CardRow key={card.id} card={card} reason="Nenhuma tarefa agendada" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="integrations">
                    <IntegrationHealthTab />
                </TabsContent>

                <TabsContent value="julia">
                    <JuliaIAConfig />
                </TabsContent>
            </Tabs>
        </div>
    )
}

interface HealthCardProps {
    title: string
    count: number
    icon: React.ElementType
    color: string
    description: string
}

function HealthCard({ title, count, icon: Icon, color, description }: HealthCardProps) {
    const colors = {
        red: 'bg-red-50 text-red-700 border-red-100',
        orange: 'bg-orange-50 text-orange-700 border-orange-100',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    }

    return (
        <div className={`p-6 rounded-xl border ${colors[color as keyof typeof colors]}`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="font-medium opacity-90">{title}</p>
                    <h3 className="text-3xl font-bold mt-2">{count}</h3>
                </div>
                <Icon className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm mt-4 opacity-75">{description}</p>
        </div>
    )
}

function CardRow({ card, reason }: { card: Card, reason: string }) {
    return (
        <div className="p-4 flex items-center justify-between hover:bg-muted/50 group transition-colors">
            <div>
                <Link to={`/cards/${card.id}`} className="font-medium text-foreground hover:text-primary">
                    {card.titulo}
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <span>{card.etapa_nome}</span>
                    <span>•</span>
                    <span>{card.dono_atual_nome}</span>
                </div>
            </div>
            <div className="text-right">
                <span className="text-sm font-medium text-destructive">{reason}</span>
                <Link
                    to={`/cards/${card.id}`}
                    className="flex items-center gap-1 text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                >
                    Ver Card <ArrowRight className="w-3 h-3" />
                </Link>
            </div>
        </div>
    )
}
