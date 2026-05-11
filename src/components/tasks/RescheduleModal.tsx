import { useState } from 'react'
import { X, Clock } from 'lucide-react'
import { addHours, addDays, setHours, setMinutes, nextMonday, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'
import type { TaskListItem } from '../../hooks/useTasksList'

interface Preset {
    key: string
    label: string
    compute: (now: Date) => Date
}

const PRESETS: Preset[] = [
    { key: '1h', label: '+ 1 hora', compute: (now) => addHours(now, 1) },
    { key: '4h', label: '+ 4 horas', compute: (now) => addHours(now, 4) },
    { key: 'tomorrow_9', label: 'Amanhã 9h', compute: (now) => setMinutes(setHours(addDays(now, 1), 9), 0) },
    { key: 'tomorrow_14', label: 'Amanhã 14h', compute: (now) => setMinutes(setHours(addDays(now, 1), 14), 0) },
    { key: 'next_monday', label: 'Segunda 9h', compute: (now) => setMinutes(setHours(nextMonday(now), 9), 0) },
    { key: 'next_week', label: 'Daqui 7 dias', compute: (now) => addDays(now, 7) },
]

export function RescheduleModal({
    task,
    open,
    onOpenChange,
}: {
    task: TaskListItem | null
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { profile } = useAuth()
    const queryClient = useQueryClient()
    const [customDate, setCustomDate] = useState<string>('')
    const [motivo, setMotivo] = useState<string>('')

    const mutation = useMutation({
        mutationFn: async ({ newDate }: { newDate: Date }) => {
            if (!task) throw new Error('Sem tarefa')

            // 1) Criar nova tarefa com os mesmos dados, rescheduled_from_id = task.id
            const { data: inserted, error: insertErr } = await supabase
                .from('tarefas')
                .insert({
                    card_id: task.card_id,
                    titulo: task.titulo,
                    descricao: task.descricao,
                    tipo: task.tipo,
                    categoria_outro: task.categoria_outro,
                    prioridade: task.prioridade,
                    responsavel_id: task.responsavel_id,
                    data_vencimento: newDate.toISOString(),
                    status: 'pendente',
                    concluida: false,
                    rescheduled_from_id: task.id,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    metadata: (task.metadata || {}) as any,
                    created_by: profile?.id,
                })
                .select('id')
                .single()
            if (insertErr) throw insertErr

            // 2) Marcar a tarefa original como reagendada
            const { error: updateErr } = await supabase
                .from('tarefas')
                .update({
                    status: 'reagendada',
                    outcome: 'rescheduled',
                    resultado: 'rescheduled',
                    concluida: true,
                    concluida_em: new Date().toISOString(),
                    concluido_por: profile?.id,
                    rescheduled_to_id: inserted.id,
                    feedback: motivo || null,
                })
                .eq('id', task.id)
            if (updateErr) throw updateErr
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            toast.success('Tarefa reagendada')
            onOpenChange(false)
            setCustomDate('')
            setMotivo('')
        },
        onError: (err: Error) => {
            toast.error('Erro ao reagendar', { description: err.message })
        },
    })

    if (!open || !task) return null

    const handlePreset = (preset: Preset) => {
        const newDate = preset.compute(new Date())
        mutation.mutate({ newDate })
    }

    const handleCustom = () => {
        if (!customDate) return
        const newDate = new Date(customDate)
        if (isNaN(newDate.getTime())) {
            toast.error('Data inválida')
            return
        }
        mutation.mutate({ newDate })
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => onOpenChange(false)}
        >
            <div
                className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-md w-full p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900 tracking-tight">Reagendar tarefa</h3>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[320px]">{task.titulo}</p>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="text-slate-400 hover:text-slate-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    {PRESETS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => handlePreset(p)}
                            disabled={mutation.isPending}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                                "bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                        >
                            <Clock className="h-3.5 w-3.5" />
                            <div className="flex-1 text-left">
                                <div>{p.label}</div>
                                <div className="text-[10px] text-slate-400 font-normal">
                                    {format(p.compute(new Date()), "dd/MM HH:mm", { locale: ptBR })}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Data/hora personalizada</label>
                        <input
                            type="datetime-local"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Motivo (opcional)</label>
                        <input
                            type="text"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder="ex: cliente não atendeu"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>

                    <button
                        onClick={handleCustom}
                        disabled={!customDate || mutation.isPending}
                        className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {mutation.isPending ? 'Reagendando...' : 'Reagendar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
