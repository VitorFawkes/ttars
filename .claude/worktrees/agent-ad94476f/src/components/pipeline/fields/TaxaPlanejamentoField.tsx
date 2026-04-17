import { CheckCircle2, Clock, XCircle, Gift, Ban } from 'lucide-react'
import { FieldWrapper } from './BaseField'
import type { BaseFieldProps } from './BaseField'

type TaxaStatus = 'nao_ativa' | 'pendente' | 'paga' | 'cortesia' | 'nao_aplicavel'

interface TaxaPlanejamento {
    ativa: boolean
    status: TaxaStatus
    valor?: number
    data_envio?: string
    data_pagamento?: string
    codigo_transacao?: string
    meio_pagamento?: string
    autorizada_por?: string
}

const STATUS_CONFIG = {
    pendente: {
        label: 'Pendente',
        icon: Clock,
        color: 'text-yellow-700 bg-yellow-100 border-yellow-200'
    },
    paga: {
        label: 'Paga',
        icon: CheckCircle2,
        color: 'text-green-700 bg-green-100 border-green-200'
    },
    cortesia: {
        label: 'Cortesia',
        icon: Gift,
        color: 'text-blue-700 bg-blue-100 border-blue-200'
    },
    nao_ativa: {
        label: 'Não Ativa',
        icon: Ban,
        color: 'text-gray-700 bg-gray-100 border-gray-200'
    },
    nao_aplicavel: {
        label: 'Não Aplicável',
        icon: XCircle,
        color: 'text-gray-700 bg-gray-100 border-gray-200'
    }
}

export default function TaxaPlanejamentoField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    const taxa = (value as TaxaPlanejamento | null | undefined) || {
        ativa: false,
        status: 'nao_ativa'
    }

    const statusConfig = STATUS_CONFIG[taxa.status]
    const Icon = statusConfig.icon

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(val)
    }

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return null
        return new Date(dateStr).toLocaleDateString('pt-BR')
    }

    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                <div className="space-y-2">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusConfig.color}`}>
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{statusConfig.label}</span>
                    </div>

                    {taxa.valor && taxa.valor > 0 && (
                        <div className="text-sm text-gray-900">
                            Valor: <span className="font-medium">{formatCurrency(taxa.valor)}</span>
                        </div>
                    )}

                    {taxa.data_pagamento && (
                        <div className="text-sm text-gray-600">
                            Pago em: {formatDate(taxa.data_pagamento)}
                            {taxa.meio_pagamento && ` via ${taxa.meio_pagamento}`}
                        </div>
                    )}

                    {taxa.status === 'cortesia' && taxa.autorizada_por && (
                        <div className="text-sm text-gray-600">
                            Autorizado por: {taxa.autorizada_por}
                        </div>
                    )}
                </div>
            </FieldWrapper>
        )
    }

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Status</label>
                    <select
                        value={taxa.status}
                        onChange={(e) => onChange({ ...taxa, status: e.target.value as TaxaStatus })}
                        onBlur={() => onSave?.()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                    >
                        <option value="nao_ativa">Não Ativa</option>
                        <option value="pendente">Pendente</option>
                        <option value="paga">Paga</option>
                        <option value="cortesia">Cortesia</option>
                        <option value="nao_aplicavel">Não Aplicável</option>
                    </select>
                </div>

                {(taxa.status === 'pendente' || taxa.status === 'paga' || taxa.status === 'cortesia') && (
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Valor</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                            <input
                                type="number"
                                min="0"
                                step="10"
                                value={taxa.valor || ''}
                                onChange={(e) => onChange({ ...taxa, valor: parseFloat(e.target.value) || undefined })}
                                onBlur={() => onSave?.()}
                                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                    </div>
                )}

                {taxa.status === 'paga' && (
                    <>
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Data Pagamento</label>
                            <input
                                type="date"
                                value={taxa.data_pagamento || ''}
                                onChange={(e) => onChange({ ...taxa, data_pagamento: e.target.value })}
                                onBlur={() => onSave?.()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Meio de Pagamento</label>
                            <input
                                type="text"
                                value={taxa.meio_pagamento || ''}
                                onChange={(e) => onChange({ ...taxa, meio_pagamento: e.target.value })}
                                onBlur={() => onSave?.()}
                                placeholder="PIX, Cartão, etc."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                    </>
                )}

                {taxa.status === 'cortesia' && (
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Autorizado Por</label>
                        <input
                            type="text"
                            value={taxa.autorizada_por || ''}
                            onChange={(e) => onChange({ ...taxa, autorizada_por: e.target.value })}
                            onBlur={() => onSave?.()}
                            placeholder="Nome do autorizador"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                )}
            </div>
        </FieldWrapper>
    )
}
