/**
 * GlobalMonitor — visão geral das execuções de TODAS as automações.
 *
 * Reorganizado pra agrupar por automação (em vez de tabela flat com tudo
 * misturado). Cada template vira um card colapsável com contadores próprios;
 * clicar expande pra mostrar as instances daquele template em tabela.
 *
 * Polling a cada 30s.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Activity, CheckCircle2, ChevronDown, ChevronRight, ExternalLink,
    RefreshCw, XCircle, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
    Card, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { FailuresPanel } from './FailuresPanel'

interface MonitorInstance {
    id: string
    card_id: string
    status: string
    started_at: string
    completed_at: string | null
    cancelled_at: string | null
    cancelled_reason: string | null
    current_step_id: string | null
    template_id: string
}

interface MonitorRow extends MonitorInstance {
    card_titulo: string
    dono_nome: string | null
    stage_nome: string | null
    template_name: string
    template_editor_version: 'v1' | 'v2'
    step_key: string | null
}

interface TemplateGroup {
    template_id: string
    template_name: string
    editor_version: 'v1' | 'v2'
    /** Última atividade (mais recente entre started_at, completed_at, cancelled_at de qualquer instance) */
    last_activity_at: string
    counts: {
        running: number   // active + waiting_task + paused
        completed: number
        cancelled: number
        failed: number
        total: number
    }
    instances: MonitorRow[]
}

const formatRelative = (iso: string): string => {
    const d = new Date(iso).getTime()
    const diffMs = Date.now() - d
    if (diffMs < 60_000) return 'agora'
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}min`
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`
    return `${Math.floor(diffMs / 86_400_000)}d`
}

export function GlobalMonitor() {
    const navigate = useNavigate()
    const [rows, setRows] = useState<MonitorRow[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sb = supabase as any

            const { data: instances, error } = await sb
                .from('cadence_instances')
                .select('id, card_id, status, started_at, completed_at, cancelled_at, cancelled_reason, current_step_id, template_id')
                .in('status', ['active', 'waiting_task', 'paused', 'completed', 'cancelled', 'failed'])
                .order('started_at', { ascending: false })
                .limit(500)

            if (error) throw error
            if (!instances || instances.length === 0) {
                setRows([])
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cardIds = [...new Set(instances.map((i: any) => i.card_id))]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const templateIds = [...new Set(instances.map((i: any) => i.template_id))]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stepIds = [...new Set(instances.map((i: any) => i.current_step_id).filter(Boolean))]

            const [cardsRes, templatesRes, stepsRes] = await Promise.all([
                sb.from('cards').select('id, titulo, dono_atual_id, pipeline_stage_id').in('id', cardIds),
                sb.from('cadence_templates').select('id, name, editor_version').in('id', templateIds),
                stepIds.length > 0
                    ? sb.from('cadence_steps').select('id, step_key').in('id', stepIds)
                    : { data: [] },
            ])

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cardMap = new Map((cardsRes.data || []).map((c: any) => [c.id, c]))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const templateMap = new Map((templatesRes.data || []).map((t: any) => [t.id, t]))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stepMap = new Map((stepsRes.data || []).map((s: any) => [s.id, s]))

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profileIds = [...new Set([...cardMap.values()].map((c: any) => c.dono_atual_id).filter(Boolean))]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageIds = [...new Set([...cardMap.values()].map((c: any) => c.pipeline_stage_id).filter(Boolean))]

            const [profilesRes, stagesRes] = await Promise.all([
                profileIds.length > 0
                    ? sb.from('profiles').select('id, nome').in('id', profileIds)
                    : { data: [] },
                stageIds.length > 0
                    ? sb.from('pipeline_stages').select('id, nome').in('id', stageIds)
                    : { data: [] },
            ])

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.nome]))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageMap = new Map((stagesRes.data || []).map((s: any) => [s.id, s.nome]))

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped: MonitorRow[] = instances.map((inst: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const card = cardMap.get(inst.card_id) as any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tpl = templateMap.get(inst.template_id) as any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const step = stepMap.get(inst.current_step_id) as any
                return {
                    ...inst,
                    card_titulo: card?.titulo || `Card ${inst.card_id.slice(0, 8)}`,
                    dono_nome: card?.dono_atual_id ? (profileMap.get(card.dono_atual_id) || null) : null,
                    stage_nome: card?.pipeline_stage_id ? (stageMap.get(card.pipeline_stage_id) || null) : null,
                    template_name: tpl?.name || 'Desconhecida',
                    template_editor_version: (tpl?.editor_version === 'v2' ? 'v2' : 'v1') as 'v1' | 'v2',
                    step_key: step?.step_key || null,
                }
            })

            setRows(mapped)
        } catch (err) {
            console.error('GlobalMonitor fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [fetchData])

    const handleCancel = async (instanceId: string) => {
        if (!confirm('Cancelar esta automação?')) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('cadence_instances')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_reason: 'manual' })
            .eq('id', instanceId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('cadence_queue')
            .update({ status: 'cancelled' })
            .eq('instance_id', instanceId)
            .eq('status', 'pending')
        fetchData()
    }

    // Agrupa por template_id, calcula contadores e ordena por última atividade desc
    const groups = useMemo<TemplateGroup[]>(() => {
        const map = new Map<string, TemplateGroup>()
        for (const row of rows) {
            let g = map.get(row.template_id)
            if (!g) {
                g = {
                    template_id: row.template_id,
                    template_name: row.template_name,
                    editor_version: row.template_editor_version,
                    last_activity_at: row.started_at,
                    counts: { running: 0, completed: 0, cancelled: 0, failed: 0, total: 0 },
                    instances: [],
                }
                map.set(row.template_id, g)
            }
            g.instances.push(row)
            g.counts.total += 1
            if (['active', 'waiting_task', 'paused'].includes(row.status)) g.counts.running += 1
            else if (row.status === 'completed') g.counts.completed += 1
            else if (row.status === 'cancelled') g.counts.cancelled += 1
            else if (row.status === 'failed') g.counts.failed += 1

            const events = [row.started_at, row.completed_at, row.cancelled_at].filter(Boolean) as string[]
            for (const t of events) {
                if (new Date(t).getTime() > new Date(g.last_activity_at).getTime()) {
                    g.last_activity_at = t
                }
            }
        }
        return Array.from(map.values()).sort((a, b) => {
            // Rodando primeiro, depois por última atividade
            if (a.counts.running !== b.counts.running) return b.counts.running - a.counts.running
            return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
        })
    }, [rows])

    const totals = useMemo(() => {
        return rows.reduce((acc, r) => {
            acc.total += 1
            if (['active', 'waiting_task', 'paused'].includes(r.status)) acc.running += 1
            else if (r.status === 'completed') acc.completed += 1
            else if (r.status === 'cancelled') acc.cancelled += 1
            else if (r.status === 'failed') acc.failed += 1
            return acc
        }, { total: 0, running: 0, completed: 0, cancelled: 0, failed: 0 })
    }, [rows])

    const toggleGroup = (templateId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(templateId)) next.delete(templateId)
            else next.add(templateId)
            return next
        })
    }

    const openEditor = (group: TemplateGroup) => {
        if (group.editor_version === 'v2') {
            navigate(`/settings/automations/v2/${group.template_id}`)
        } else {
            navigate(`/settings/automations/automacao/${group.template_id}`)
        }
    }

    const statusBadge = (status: string) => {
        switch (status) {
            case 'active':       return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Ativa</Badge>
            case 'waiting_task': return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Aguardando</Badge>
            case 'paused':       return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Pausada</Badge>
            case 'completed':    return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Completa</Badge>
            case 'cancelled':    return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Cancelada</Badge>
            case 'failed':       return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Falhou</Badge>
            default:             return <Badge variant="outline">{status}</Badge>
        }
    }

    return (
        <div className="space-y-6">
            {/* Contadores globais */}
            <div className="grid grid-cols-5 gap-3">
                <Card className="bg-white border-slate-200">
                    <CardHeader className="pb-2">
                        <CardDescription>Total</CardDescription>
                        <CardTitle className="text-2xl">{totals.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-emerald-50 border-emerald-200">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1 text-emerald-700"><Activity className="w-3 h-3" /> Rodando</CardDescription>
                        <CardTitle className="text-2xl text-emerald-700">{totals.running}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-blue-50 border-blue-200">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1 text-blue-700"><CheckCircle2 className="w-3 h-3" /> Completas</CardDescription>
                        <CardTitle className="text-2xl text-blue-700">{totals.completed}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-slate-50 border-slate-200">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1 text-slate-600"><XCircle className="w-3 h-3" /> Canceladas</CardDescription>
                        <CardTitle className="text-2xl text-slate-700">{totals.cancelled}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-rose-50 border-rose-200">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1 text-rose-700"><AlertCircle className="w-3 h-3" /> Falhas</CardDescription>
                        <CardTitle className="text-2xl text-rose-700">{totals.failed}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Lista por automação */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Por automação ({groups.length})
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {groups.length === 0 && !loading && (
                    <div className="p-12 text-center text-slate-500">
                        <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        Nenhuma execução registrada.
                    </div>
                )}

                <div className="divide-y divide-slate-100">
                    {groups.map((g) => {
                        const isOpen = expanded.has(g.template_id)
                        return (
                            <div key={g.template_id}>
                                <button
                                    onClick={() => toggleGroup(g.template_id)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
                                >
                                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-900 truncate">{g.template_name}</span>
                                            {g.counts.running > 0 && (
                                                <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                                                    <span className="relative flex h-1.5 w-1.5">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                                    </span>
                                                    {g.counts.running} ao vivo
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span>{g.counts.total} {g.counts.total === 1 ? 'instância' : 'instâncias'}</span>
                                            {g.counts.completed > 0 && <span>{g.counts.completed} completas</span>}
                                            {g.counts.cancelled > 0 && <span>{g.counts.cancelled} canceladas</span>}
                                            {g.counts.failed > 0 && <span className="text-rose-600">{g.counts.failed} falhas</span>}
                                            <span>•</span>
                                            <span>última atividade {formatRelative(g.last_activity_at)}</span>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); openEditor(g) }}
                                        title="Abrir editor"
                                    >
                                        <ExternalLink className="w-4 h-4 text-slate-500" />
                                    </Button>
                                </button>

                                {isOpen && (
                                    <div className="bg-slate-50 border-t border-slate-100 overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="text-[11px]">Card</TableHead>
                                                    <TableHead className="text-[11px]">Responsável</TableHead>
                                                    <TableHead className="text-[11px]">Etapa</TableHead>
                                                    <TableHead className="text-[11px]">Step</TableHead>
                                                    <TableHead className="text-[11px]">Status</TableHead>
                                                    <TableHead className="text-[11px]">Iniciada</TableHead>
                                                    <TableHead></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {g.instances.map((row) => (
                                                    <TableRow key={row.id} className="bg-white">
                                                        <TableCell>
                                                            <a href={`/card/${row.card_id}`} className="text-blue-600 hover:underline font-medium text-sm" target="_blank" rel="noreferrer">
                                                                {row.card_titulo}
                                                            </a>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-600">{row.dono_nome || '—'}</TableCell>
                                                        <TableCell>
                                                            {row.stage_nome ? <Badge variant="outline" className="text-xs">{row.stage_nome}</Badge> : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-slate-500 font-mono truncate max-w-[140px]">
                                                            {row.step_key || '—'}
                                                        </TableCell>
                                                        <TableCell>
                                                            {statusBadge(row.status)}
                                                            {row.cancelled_reason && (
                                                                <div className="text-[10px] text-slate-500 mt-0.5">{row.cancelled_reason}</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-slate-500">
                                                            {new Date(row.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                            <div className="text-[10px] text-slate-400">{formatRelative(row.started_at)}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {['active', 'waiting_task', 'paused'].includes(row.status) && (
                                                                <Button variant="ghost" size="sm" onClick={() => handleCancel(row.id)} className="text-red-500 hover:text-red-700">
                                                                    <XCircle className="w-4 h-4" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {loading && groups.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Carregando...
                    </div>
                )}
            </div>

            <FailuresPanel />
        </div>
    )
}
