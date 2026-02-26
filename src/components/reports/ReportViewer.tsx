import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, Pin, PinOff, Loader2, AlertCircle } from 'lucide-react'
import { useSavedReport, useUpdateReport, useDeleteReport } from '@/hooks/reports/useSavedReports'
import { useReportEngine } from '@/hooks/reports/useReportEngine'
import { useReportDrillDown } from '@/hooks/reports/useReportDrillDown'
import { buildReportKeys, mapDrillFilters } from '@/lib/reports/buildReportKeys'
import ChartRenderer from './renderers/ChartRenderer'
import DrillDownPanel from './renderers/DrillDownPanel'
import type { DrillDownFilters } from '@/lib/reports/reportTypes'

export default function ReportViewer() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [drillFilters, setDrillFilters] = useState<DrillDownFilters | null>(null)

    const { data: report, isLoading: reportLoading } = useSavedReport(id)
    const updateReport = useUpdateReport()
    const deleteReport = useDeleteReport()

    const { data: queryData, isLoading: queryLoading, error: queryError } = useReportEngine({
        config: report?.config ?? null,
        enabled: !!report,
    })

    // Build keys/labels matching RPC output aliases
    const { dimensionKeys, measureKeys, labels, drillFieldMap, keyFormats } = useMemo(() => {
        if (!report?.config) return { dimensionKeys: [], measureKeys: [], labels: {}, drillFieldMap: {}, keyFormats: {} }
        return buildReportKeys(report.config)
    }, [report?.config])

    // Map drill filters from data keys to actual field names
    const mappedDrillFilters = useMemo(() => {
        if (!drillFilters) return null
        return mapDrillFilters(drillFilters, drillFieldMap)
    }, [drillFilters, drillFieldMap])

    const { data: drillData, isLoading: drillLoading } = useReportDrillDown({
        config: report?.config ?? null,
        drillFilters: mappedDrillFilters,
    })

    if (reportLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
        )
    }

    if (!report) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="text-sm">Relatório não encontrado</p>
            </div>
        )
    }

    const viz = report.visualization

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este relatório?')) return
        await deleteReport.mutateAsync(report.id)
        navigate('/reports')
    }

    const handleTogglePin = () => {
        updateReport.mutate({ id: report.id, pinned: !report.pinned })
    }

    const data = queryData ?? []

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/reports')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900">{report.title}</h1>
                        {report.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{report.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleTogglePin}
                        className="p-2 text-slate-400 hover:text-amber-500 hover:bg-slate-100 rounded-lg transition-colors"
                        title={report.pinned ? 'Desafixar' : 'Fixar'}
                    >
                        {report.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => navigate(`/reports/${id}/edit`)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
                    {queryLoading ? (
                        <div className="flex items-center justify-center h-[320px]">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                        </div>
                    ) : queryError ? (
                        <div className="flex flex-col items-center justify-center h-[320px] text-red-400">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p className="text-sm">Erro ao executar relatório</p>
                            <p className="text-xs mt-1">{(queryError as Error).message}</p>
                        </div>
                    ) : data.length > 0 ? (
                        <ChartRenderer
                            data={data}
                            visualization={viz}
                            dimensionKeys={dimensionKeys}
                            measureKeys={measureKeys}
                            labels={labels}
                            labelFormat={viz.labelFormat}
                            keyFormats={keyFormats}
                            onDrillDown={(filters) => setDrillFilters(filters)}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[320px] text-slate-400">
                            <p className="text-sm">Nenhum resultado encontrado</p>
                        </div>
                    )}

                    {/* Drill-down */}
                    {drillFilters && (
                        <DrillDownPanel
                            filters={drillFilters}
                            data={drillData}
                            isLoading={drillLoading}
                            onClose={() => setDrillFilters(null)}
                            labels={labels}
                            labelFormat={viz.labelFormat}
                        />
                    )}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                    <span>Criado em {new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
                    <span>Atualizado em {new Date(report.updated_at).toLocaleDateString('pt-BR')}</span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] uppercase tracking-wider">
                        {report.visibility}
                    </span>
                </div>
            </div>
        </div>
    )
}
