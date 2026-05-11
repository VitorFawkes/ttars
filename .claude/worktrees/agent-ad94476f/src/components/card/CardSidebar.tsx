import { Calendar, DollarSign, Phone, Mail, MessageSquare, TrendingUp, Clock, History } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useCardPeople } from '../../hooks/useCardPeople'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import type { Database } from '../../database.types'
import TaxaPlanejamentoCard from './TaxaPlanejamentoCard'
import CardTravelers from './CardTravelers'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface CardSidebarProps {
    card: Card
}

export default function CardSidebar({ card }: CardSidebarProps) {
    const receitaPerm = useReceitaPermission()
    const getDaysInStage = () => {
        if (!card.updated_at) return 0
        const diff = new Date().getTime() - new Date(card.updated_at).getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    const getDaysToTrip = () => {
        if (!card.data_viagem_inicio) return null
        const diff = new Date(card.data_viagem_inicio).getTime() - new Date().getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    // Use unified hook for consistent display
    const { primary } = useCardPeople(card.id || undefined)
    const displayNome = primary?.nome || ''

    // Fetch client history count
    const { data: clientHistory } = useQuery({
        queryKey: ['client-history', card.pessoa_principal_id],
        queryFn: async () => {
            if (!card.pessoa_principal_id) return { count: 0, trips: [] }

            const { data, error } = await supabase
                .from('cards')
                .select('id, titulo, created_at, status_comercial')
                .eq('pessoa_principal_id', card.pessoa_principal_id)
                .neq('id', card.id!) // Exclude current card
                .eq('produto', 'TRIPS')
                .order('created_at', { ascending: false })
                .limit(5)

            if (error) throw error
            return { count: data?.length || 0, trips: data || [] }
        },
        enabled: !!card.pessoa_principal_id
    })

    const phaseColors = {
        'SDR': 'bg-blue-100 text-blue-700 border-blue-200',
        'Planner': 'bg-purple-100 text-purple-700 border-purple-200',
        'Pós-venda': 'bg-green-100 text-green-700 border-green-200',
        'Outro': 'bg-gray-100 text-gray-700 border-gray-200'
    }

    // const productData = card.produto_data as any

    return (
        <div className="space-y-4">
            {/* Deal Header */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border",
                        phaseColors[card.fase as keyof typeof phaseColors] || phaseColors['Outro']
                    )}>
                        {card.fase}
                    </span>
                    <span className="text-xs text-gray-500">{card.etapa_nome}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <span className="text-2xl font-bold text-gray-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.valor_display || card.valor_estimado || 0)}
                    </span>
                </div>
                {receitaPerm.canView && card.receita != null && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed">
                        <span className="text-xs text-gray-500">Receita</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-amber-700">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.receita)}
                            </span>
                            {card.receita_source === 'calculated' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                                    Auto
                                </span>
                            )}
                        </div>
                    </div>
                )}
                {card.cliente_recorrente && clientHistory && clientHistory.count > 0 && (
                    <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2 text-xs text-indigo-600">
                            <History className="h-3.5 w-3.5" />
                            <span className="font-medium">Cliente recorrente - {clientHistory.count} viagem(ns) anterior(es)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Key Metrics */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Métricas</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>Tempo na etapa</span>
                        </div>
                        <span className="font-medium text-gray-900">{getDaysInStage()}d</span>
                    </div>
                    {getDaysToTrip() !== null && (
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                                <Calendar className="h-4 w-4" />
                                <span>Até a viagem</span>
                            </div>
                            <span className={cn(
                                "font-medium",
                                getDaysToTrip()! < 30 ? "text-orange-600" : "text-gray-900"
                            )}>
                                {getDaysToTrip()}d
                            </span>
                        </div>
                    )}
                    {card.tarefas_pendentes ? (
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                                <TrendingUp className="h-4 w-4" />
                                <span>Tarefas pendentes</span>
                            </div>
                            <span className="font-medium text-orange-600">{card.tarefas_pendentes}</span>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Taxa de Planejamento */}
            {card.produto === 'TRIPS' && <TaxaPlanejamentoCard card={card} />}

            {/* Travelers */}
            {card.produto === 'TRIPS' && <CardTravelers card={card as any} />}

            {/* Contact Info */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Contato Principal</h3>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold">
                            {displayNome.charAt(0) || ''}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{displayNome}</p>
                            <p className="text-xs text-gray-500">Cliente Principal</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100">
                            <Phone className="h-3.5 w-3.5" />
                            Ligar
                        </button>
                        <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                            <MessageSquare className="h-3.5 w-3.5" />
                            WhatsApp
                        </button>
                    </div>
                    <button className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100">
                        <Mail className="h-3.5 w-3.5" />
                        Enviar Email
                    </button>
                </div>
            </div>

            {/* Team */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Equipe</h3>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                            {card.dono_atual_nome?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{card.dono_atual_nome || 'Não atribuído'}</p>
                            <p className="text-[10px] text-gray-500">Responsável</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
