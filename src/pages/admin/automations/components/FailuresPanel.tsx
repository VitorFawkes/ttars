import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, RefreshCw, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'

type EntryRow = {
    id: string
    card_id: string | null
    trigger_id: string | null
    event_type: string | null
    status: string
    attempts: number | null
    max_attempts: number | null
    last_error: string | null
    execute_at: string | null
    created_at: string
    event_data: Record<string, unknown> | null
}

type EnrichedRow = EntryRow & {
    trigger_name: string | null
    card_titulo: string | null
}

async function invokeEngine(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).functions.invoke('cadence-engine', {
        body: { action: 'process_entry_queue' },
    })
}

export function FailuresPanel() {
    const [rows, setRows] = useState<EnrichedRow[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<EnrichedRow | null>(null)
    const [retrying, setRetrying] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sb = supabase as any
            const { data: entries, error } = await sb
                .from('cadence_entry_queue')
                .select('id, card_id, trigger_id, event_type, status, attempts, max_attempts, last_error, execute_at, created_at, event_data')
                .eq('status', 'failed')
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) throw error
            if (!entries || entries.length === 0) {
                setRows([])
                return
            }

            const triggerIds = Array.from(new Set(entries.map((e: EntryRow) => e.trigger_id).filter(Boolean))) as string[]
            const cardIds = Array.from(new Set(entries.map((e: EntryRow) => e.card_id).filter(Boolean))) as string[]

            const [triggersRes, cardsRes] = await Promise.all([
                triggerIds.length > 0
                    ? sb.from('cadence_event_triggers').select('id, name').in('id', triggerIds)
                    : { data: [] },
                cardIds.length > 0
                    ? sb.from('cards').select('id, titulo').in('id', cardIds)
                    : { data: [] },
            ])

            const triggerMap = new Map<string, string>(
                (triggersRes.data || []).map((t: { id: string; name: string | null }) => [t.id, t.name || '(sem nome)'])
            )
            const cardMap = new Map<string, string>(
                (cardsRes.data || []).map((c: { id: string; titulo: string | null }) => [c.id, c.titulo || c.id])
            )

            setRows(entries.map((e: EntryRow) => ({
                ...e,
                trigger_name: e.trigger_id ? (triggerMap.get(e.trigger_id) || null) : null,
                card_titulo: e.card_id ? (cardMap.get(e.card_id) || null) : null,
            })))
        } catch (err) {
            console.error('FailuresPanel fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [fetchData])

    const handleRetry = async (row: EnrichedRow) => {
        setRetrying(row.id)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('cadence_entry_queue')
                .update({
                    status: 'pending',
                    attempts: 0,
                    last_error: null,
                    execute_at: new Date().toISOString(),
                })
                .eq('id', row.id)
            if (error) throw error

            await invokeEngine()
            toast.success('Reexecutando — o resultado aparece no monitor em alguns segundos')
            setSelected(null)
            setTimeout(fetchData, 2000)
        } catch (err) {
            console.error('retry failed:', err)
            toast.error('Não consegui reexecutar. Tente de novo em alguns segundos.')
        } finally {
            setRetrying(null)
        }
    }

    const failureCount = rows.length
    const olderThan24h = useMemo(
        () => rows.filter((r) => Date.now() - new Date(r.created_at).getTime() > 24 * 3600 * 1000).length,
        [rows]
    )

    return (
        <>
            <Card className="bg-white border-slate-200">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            Falhas recentes
                            {failureCount > 0 && (
                                <Badge className="bg-red-100 text-red-700 border-red-200">
                                    {failureCount}
                                </Badge>
                            )}
                        </CardTitle>
                        {olderThan24h > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                                {olderThan24h} com mais de 24h — vale investigar a raiz antes de reexecutar
                            </p>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent className="pt-0">
                    {rows.length === 0 && !loading ? (
                        <div className="text-center py-8 text-slate-500 text-sm">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            Nenhuma falha recente. Tudo rodando como esperado.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Automação</TableHead>
                                    <TableHead>Card</TableHead>
                                    <TableHead>Erro</TableHead>
                                    <TableHead>Tentativas</TableHead>
                                    <TableHead>Desde</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="text-sm">
                                            {row.trigger_name || (
                                                <span className="text-slate-400 italic">sem nome</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {row.card_id ? (
                                                <a
                                                    href={`/card/${row.card_id}`}
                                                    target="_blank"
                                                    className="text-blue-600 hover:underline text-sm"
                                                    rel="noreferrer"
                                                >
                                                    {row.card_titulo || row.card_id.slice(0, 8)}
                                                </a>
                                            ) : (
                                                <span className="text-slate-400 text-sm">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-[280px]">
                                            <span className="text-xs text-slate-600 line-clamp-2">
                                                {row.last_error || '(sem detalhe)'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500">
                                            {row.attempts ?? 0}/{row.max_attempts ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500">
                                            {new Date(row.created_at).toLocaleDateString('pt-BR', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelected(row)}
                                                className="text-slate-600"
                                            >
                                                Detalhes
                                                <ChevronRight className="w-3 h-3 ml-1" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {selected && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between p-5 border-b border-slate-200">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                    Detalhes da falha
                                </h3>
                                <p className="text-sm text-slate-600 mt-1">
                                    {selected.trigger_name || 'Automação sem nome'}
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="p-5 space-y-4 text-sm">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                                    Mensagem de erro
                                </p>
                                <pre className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-800 whitespace-pre-wrap font-mono">
                                    {selected.last_error || '(sem detalhe)'}
                                </pre>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="font-medium text-slate-500 uppercase tracking-wide mb-1">Gatilho</p>
                                    <p className="text-slate-800">{selected.event_type || '—'}</p>
                                </div>
                                <div>
                                    <p className="font-medium text-slate-500 uppercase tracking-wide mb-1">Tentativas</p>
                                    <p className="text-slate-800">
                                        {selected.attempts ?? 0} de {selected.max_attempts ?? '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="font-medium text-slate-500 uppercase tracking-wide mb-1">Desde</p>
                                    <p className="text-slate-800">
                                        {new Date(selected.created_at).toLocaleString('pt-BR')}
                                    </p>
                                </div>
                                <div>
                                    <p className="font-medium text-slate-500 uppercase tracking-wide mb-1">Próxima execução</p>
                                    <p className="text-slate-800">
                                        {selected.execute_at
                                            ? new Date(selected.execute_at).toLocaleString('pt-BR')
                                            : '—'}
                                    </p>
                                </div>
                            </div>

                            {selected.event_data && Object.keys(selected.event_data).length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                                        Dados do evento
                                    </p>
                                    <pre className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-800 overflow-auto">
                                        {JSON.stringify(selected.event_data, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 bg-slate-50">
                            <Button variant="outline" onClick={() => setSelected(null)}>
                                Fechar
                            </Button>
                            <Button
                                onClick={() => handleRetry(selected)}
                                disabled={retrying === selected.id}
                                className="gap-2"
                            >
                                <RotateCcw className={`w-4 h-4 ${retrying === selected.id ? 'animate-spin' : ''}`} />
                                {retrying === selected.id ? 'Reexecutando...' : 'Reexecutar agora'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
