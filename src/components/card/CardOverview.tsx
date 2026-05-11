import DynamicFieldRenderer from './DynamicFieldRenderer'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface CardOverviewProps {
    card: Card
}

export default function CardOverview({ card }: CardOverviewProps) {
    const receitaPerm = useReceitaPermission()

    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-6">
                <div className="rounded-lg border bg-white p-4 shadow-sm">
                    <h3 className="mb-4 text-lg font-medium text-gray-900">Detalhes Financeiros</h3>
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Valor Estimado</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: card.moeda || 'BRL' }).format(card.valor_estimado || 0)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Valor de Venda</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                                {card.valor_final
                                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: card.moeda || 'BRL' }).format(card.valor_final)
                                    : '-'}
                            </dd>
                        </div>
                        {receitaPerm.canView && (
                            <div>
                                <dt className="text-sm font-medium text-gray-500">
                                    Receita
                                    {card.receita_source === 'calculated' && (
                                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-normal">
                                            Calculado
                                        </span>
                                    )}
                                    {card.receita_source === 'manual' && (
                                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-normal">
                                            Manual
                                        </span>
                                    )}
                                </dt>
                                <dd className="mt-1 text-sm font-semibold text-amber-700">
                                    {card.receita != null
                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: card.moeda || 'BRL' }).format(card.receita)
                                        : '-'}
                                </dd>
                            </div>
                        )}
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Condições de Pagamento</dt>
                            <dd className="mt-1 text-sm text-gray-900">{card.condicoes_pagamento || '-'}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Forma de Pagamento</dt>
                            <dd className="mt-1 text-sm text-gray-900">{card.forma_pagamento || '-'}</dd>
                        </div>
                    </dl>
                </div>

                <div className="rounded-lg border bg-white p-4 shadow-sm">
                    <h3 className="mb-4 text-lg font-medium text-gray-900">Status e Datas</h3>
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Status Comercial</dt>
                            <dd className="mt-1 text-sm text-gray-900 capitalize">{card.status_comercial?.replace('_', ' ')}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Estado Operacional</dt>
                            <dd className="mt-1 text-sm text-gray-900 capitalize">{card.estado_operacional?.replace('_', ' ')}</dd>
                        </div>
                        <div className="sm:col-span-2 border-t pt-4 mt-2">
                            <dt className="text-sm font-semibold text-indigo-600 mb-2">Período da Viagem</dt>
                            <div className="flex gap-4">
                                <div>
                                    <span className="text-xs text-gray-500">Início:</span>
                                    <dd className="text-sm text-gray-900">
                                        {card.data_viagem_inicio
                                            ? new Date(card.data_viagem_inicio).toLocaleDateString('pt-BR')
                                            : '-'}
                                    </dd>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500">Fim:</span>
                                    <dd className="text-sm text-gray-900">
                                        {(card as any).data_viagem_fim
                                            ? new Date((card as any).data_viagem_fim).toLocaleDateString('pt-BR')
                                            : '-'}
                                    </dd>
                                </div>
                            </div>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Criado em</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                                {card.created_at ? new Date(card.created_at).toLocaleDateString('pt-BR') : '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Atualizado em</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                                {card.updated_at ? new Date(card.updated_at).toLocaleDateString('pt-BR') : '-'}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <div className="space-y-6">
                <div className="rounded-lg border bg-white p-4 shadow-sm">
                    <h3 className="mb-4 text-lg font-medium text-gray-900">Responsáveis</h3>
                    <dl className="space-y-3">
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Dono Atual</dt>
                            <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                                <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                    {card.dono_atual_nome?.charAt(0) || 'U'}
                                </div>
                                {card.dono_atual_nome || 'Não atribuído'}
                            </dd>
                        </div>
                        {card.sdr_owner_nome && (
                            <div>
                                <dt className="text-sm font-medium text-gray-500">SDR</dt>
                                <dd className="mt-1 text-sm text-gray-900">{card.sdr_owner_nome}</dd>
                            </div>
                        )}
                        {card.vendas_nome && (
                            <div>
                                <dt className="text-sm font-medium text-gray-500">Vendas</dt>
                                <dd className="mt-1 text-sm text-gray-900">{card.vendas_nome}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                <DynamicFieldRenderer card={card} />
            </div>
        </div>
    )
}
