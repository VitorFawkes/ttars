import { useState } from 'react'
import { Download, Loader2, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '../ui/Button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { toast } from 'sonner'
import type { LeadCard } from '../../hooks/useLeadsQuery'
import { useLeadsColumns } from '../../hooks/useLeadsColumns'
import { format } from 'date-fns'

interface LeadsExportProps {
    leads: LeadCard[]
    selectedIds?: string[]
}

// Column definitions for export
const EXPORT_COLUMNS: Record<string, { label: string, getValue: (lead: LeadCard) => string }> = {
    titulo: { label: 'Título', getValue: (l) => l.titulo || '' },
    pessoa_nome: { label: 'Cliente', getValue: (l) => l.pessoa_nome || '' },
    pessoa_email: { label: 'Email', getValue: (l) => l.pessoa_email || '' },
    pessoa_telefone: { label: 'Telefone', getValue: (l) => l.pessoa_telefone || '' },
    etapa_nome: { label: 'Etapa', getValue: (l) => l.etapa_nome || '' },
    pipeline_nome: { label: 'Pipeline', getValue: (l) => l.pipeline_nome || '' },
    dono_atual_nome: { label: 'Responsável', getValue: (l) => l.dono_atual_nome || '' },
    valor_estimado: { label: 'Valor Estimado', getValue: (l) => (l.valor_estimado || 0).toString() },
    prioridade: { label: 'Prioridade', getValue: (l) => l.prioridade || '' },
    status_comercial: { label: 'Status', getValue: (l) => l.status_comercial || '' },
    origem: { label: 'Origem', getValue: (l) => l.origem || '' },
    data_viagem_inicio: { label: 'Data Viagem', getValue: (l) => l.data_viagem_inicio ? format(new Date(l.data_viagem_inicio), 'dd/MM/yyyy') : '' },
    dias_ate_viagem: { label: 'Dias p/ Viagem', getValue: (l) => (l.dias_ate_viagem as number)?.toString() || '' },
    tempo_sem_contato: { label: 'Dias s/ Contato', getValue: (l) => (l.tempo_sem_contato as number)?.toString() || '' },
    tarefas_atrasadas: { label: 'Tarefas Atrasadas', getValue: (l) => (l.tarefas_atrasadas as number)?.toString() || '0' },
    tarefas_pendentes: { label: 'Tarefas Pendentes', getValue: (l) => (l.tarefas_pendentes as number)?.toString() || '0' },
    created_at: { label: 'Data Criação', getValue: (l) => l.created_at ? format(new Date(l.created_at), 'dd/MM/yyyy HH:mm') : '' },
    updated_at: { label: 'Última Atualização', getValue: (l) => l.updated_at ? format(new Date(l.updated_at), 'dd/MM/yyyy HH:mm') : '' },
}

// Default columns for export
const DEFAULT_EXPORT_COLUMNS = [
    'titulo', 'pessoa_nome', 'pessoa_email', 'pessoa_telefone',
    'etapa_nome', 'dono_atual_nome', 'valor_estimado', 'prioridade',
    'status_comercial', 'origem', 'created_at', 'updated_at'
]

export default function LeadsExport({ leads, selectedIds }: LeadsExportProps) {
    const [isExporting, setIsExporting] = useState(false)
    const { columns } = useLeadsColumns()

    const leadsToExport = selectedIds?.length
        ? leads.filter(l => selectedIds.includes(l.id!))
        : leads

    const exportCSV = async (columnIds: string[]) => {
        setIsExporting(true)

        try {
            if (leadsToExport.length === 0) {
                toast.error('Nenhum lead para exportar')
                return
            }

            // Get column definitions
            const columnsToExport = columnIds
                .filter(id => EXPORT_COLUMNS[id])
                .map(id => ({ id, ...EXPORT_COLUMNS[id] }))

            // Build headers
            const headers = columnsToExport.map(c => c.label)

            // Build rows
            const rows = leadsToExport.map(lead =>
                columnsToExport.map(col => escapeCSV(col.getValue(lead)))
            )

            // Build CSV content
            const csvContent = [
                headers.join(';'),
                ...rows.map(row => row.join(';'))
            ].join('\n')

            // Add BOM for Excel compatibility with UTF-8
            const BOM = '\uFEFF'
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' })

            // Create download link
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `leads_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

            toast.success(`${leadsToExport.length} leads exportados com sucesso!`)
        } catch (error) {
            console.error('Export error:', error)
            toast.error('Erro ao exportar leads')
        } finally {
            setIsExporting(false)
        }
    }

    const handleExportAll = () => {
        exportCSV(DEFAULT_EXPORT_COLUMNS)
    }

    const handleExportVisible = () => {
        const visibleColumnIds = columns
            .filter(c => c.isVisible)
            .map(c => c.id)
            .filter(id => EXPORT_COLUMNS[id])

        // Always include basic columns if not present
        const basicColumns = ['titulo', 'pessoa_nome']
        const columnIds = [...new Set([...basicColumns, ...visibleColumnIds])]

        exportCSV(columnIds)
    }

    const handleExportComplete = () => {
        exportCSV(Object.keys(EXPORT_COLUMNS))
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={isExporting || leads.length === 0}
                    className="h-9 gap-2"
                >
                    {isExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    Exportar
                    {selectedIds?.length ? ` (${selectedIds.length})` : ''}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleExportAll}>
                    <FileText className="h-4 w-4 mr-2" />
                    CSV Padrão
                    <span className="ml-auto text-xs text-gray-500">12 colunas</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleExportVisible}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    CSV (Colunas Visíveis)
                    <span className="ml-auto text-xs text-gray-500">
                        {columns.filter(c => c.isVisible).length} cols
                    </span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleExportComplete}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    CSV Completo
                    <span className="ml-auto text-xs text-gray-500">
                        {Object.keys(EXPORT_COLUMNS).length} colunas
                    </span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// Escape CSV field to handle commas, quotes, and newlines
function escapeCSV(field: string): string {
    if (!field) return ''
    // If field contains semicolon, quote, or newline, wrap in quotes and escape internal quotes
    if (field.includes(';') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`
    }
    return field
}
