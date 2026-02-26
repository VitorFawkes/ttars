import { X, Loader2, Download } from 'lucide-react'
import { autoFormat } from '@/lib/reports/formatters'
import type { DrillDownFilters } from '@/lib/reports/reportTypes'

const DRILL_COLUMN_LABELS: Record<string, string> = {
    id: 'ID',
    titulo: 'Título',
    produto: 'Produto',
    status_comercial: 'Status',
    etapa: 'Etapa',
    responsavel: 'Responsável',
    valor_estimado: 'Valor Estimado',
    valor_final: 'Faturamento',
    receita: 'Receita',
    created_at: 'Data Criação',
    data_fechamento: 'Fechamento',
    nome: 'Nome',
    sobrenome: 'Sobrenome',
    email: 'Email',
    telefone: 'Telefone',
    tipo_cliente: 'Tipo Cliente',
    origem: 'Origem',
    card_titulo: 'Card',
    status: 'Status',
    accepted_total: 'Total Aceito',
    consultor: 'Consultor',
    tipo: 'Tipo',
    prioridade: 'Prioridade',
    data_vencimento: 'Vencimento',
    resultado: 'Resultado',
    data_inicio: 'Data Início',
    direction: 'Direção',
    message_type: 'Tipo Msg',
    fase_label: 'Fase',
    contato_nome: 'Contato',
    template: 'Template',
    successful_contacts: 'Contatos',
    started_at: 'Início',
    tipo_documento: 'Tipo Doc',
    modo: 'Modo',
    etapa_destino: 'Etapa Destino',
    movido_por: 'Movido Por',
    tempo_na_etapa_anterior: 'Tempo Anterior',
    data_mudanca: 'Data',
    canal: 'Canal',
    lado: 'Lado',
    data_hora: 'Data/Hora',
    time: 'Time',
    fase: 'Fase',
    role: 'Role',
    // Additional fields
    dias_etapa: 'Dias na Etapa',
    supplier_cost: 'Custo Fornecedor',
    forma_pagamento: 'Forma Pgto',
    destinos: 'Destinos',
    data_viagem: 'Data Viagem',
    data_retorno: 'Data Retorno',
    pax_adultos: 'Adultos',
    pax_criancas: 'Crianças',
    total_pax: 'Total Pax',
    moeda: 'Moeda',
    taxa_valor: 'Valor Taxa',
    total_spend: 'Gasto Total',
    total_trips: 'Total Viagens',
    cpf: 'CPF',
    rg: 'RG',
    cidade: 'Cidade',
    estado: 'Estado',
    pais: 'País',
    data_nascimento: 'Nascimento',
    passaporte_validade: 'Validade Passaporte',
    sexo: 'Sexo',
    primeira_venda_data: '1ª Venda',
    ultima_venda_data: 'Última Venda',
    descricao: 'Descrição',
    conteudo: 'Conteúdo',
    updated_at: 'Atualização',
    completed_at: 'Conclusão',
    valor_total: 'Valor Total',
    margem_pct: 'Margem %',
    parent_titulo: 'Card Grupo',
}

const NUMERIC_COLUMNS = new Set([
    'valor_estimado', 'valor_final', 'receita', 'accepted_total',
    'taxa_valor', 'total_spend', 'total_trips', 'successful_contacts',
    'tempo_na_etapa_anterior', 'supplier_cost', 'pax_adultos',
    'pax_criancas', 'total_pax', 'dias_etapa', 'ciclo_dias',
    'valor_total', 'margem_pct',
])

interface DrillDownPanelProps {
    filters: DrillDownFilters
    data: Record<string, unknown>[] | undefined
    isLoading: boolean
    onClose: () => void
    labels?: Record<string, string>
    labelFormat?: 'number' | 'currency' | 'percent'
}

export default function DrillDownPanel({
    filters,
    data,
    isLoading,
    onClose,
    labels,
    labelFormat,
}: DrillDownPanelProps) {
    const filterDesc = Object.entries(filters)
        .map(([k, v]) => {
            const label = labels?.[k] ?? k
            return `${label} = "${v}"`
        })
        .join(', ')

    const handleExportCSV = () => {
        if (!data?.length) return
        const keys = Object.keys(data[0])
        const header = keys.map(k => DRILL_COLUMN_LABELS[k] ?? k).join(',')
        const rows = data.map(row =>
            keys.map(k => {
                const v = row[k]
                if (v === null || v === undefined) return ''
                const s = String(v)
                return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
            }).join(',')
        )
        const csv = [header, ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `drill-down-${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const formatCellValue = (key: string, value: unknown) => {
        if (value === null || value === undefined) return <span className="text-slate-300">—</span>
        if (NUMERIC_COLUMNS.has(key) && typeof value === 'number') {
            return autoFormat(value, labelFormat)
        }
        if (key.includes('created_at') || key.includes('data_') || key.includes('vencimento') || key.includes('inicio') || key.includes('mudanca') || key.includes('data_hora') || key === 'started_at') {
            const d = new Date(String(value))
            if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR')
        }
        return String(value)
    }

    return (
        <div className="border-t border-slate-200 bg-slate-50/80 rounded-b-xl">
            <div className="flex items-center justify-between px-4 py-3">
                <div className="text-xs font-medium text-slate-700">
                    Drill-down: <span className="text-indigo-600">{filterDesc}</span>
                    {data && <span className="text-slate-400 ml-2">({data.length} registro{data.length !== 1 ? 's' : ''})</span>}
                </div>
                <div className="flex items-center gap-2">
                    {data && data.length > 0 && (
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded hover:bg-slate-100"
                        >
                            <Download className="w-3 h-3" />
                            CSV
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    <span className="text-xs text-slate-400 ml-2">Carregando registros...</span>
                </div>
            ) : data && data.length > 0 ? (
                <div className="overflow-auto max-h-[300px] px-4 pb-4">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-200">
                                {Object.keys(data[0]).filter(k => k !== 'id').map(k => (
                                    <th key={k} className="text-left py-2 px-2 text-slate-500 font-medium bg-white sticky top-0 uppercase tracking-wide text-[10px]">
                                        {DRILL_COLUMN_LABELS[k] ?? k}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i} className="border-b border-slate-100 hover:bg-white transition-colors">
                                    {Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => (
                                        <td key={k} className={`py-1.5 px-2 whitespace-nowrap ${NUMERIC_COLUMNS.has(k) ? 'text-right font-mono text-slate-700' : 'text-slate-600'}`}>
                                            {formatCellValue(k, v)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-6 text-xs text-slate-400">
                    Nenhum registro encontrado
                </div>
            )}
        </div>
    )
}
