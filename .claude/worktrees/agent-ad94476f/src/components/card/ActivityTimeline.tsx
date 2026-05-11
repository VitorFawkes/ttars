import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { CheckSquare, MessageCircle, Send, AlertCircle, Clock, Filter } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ActivityTimelineProps {
    cardId: string
}

type Activity = {
    id: string
    type: 'task' | 'note' | 'activity' | 'system'
    title: string
    description?: string
    timestamp: string
    author?: string
    completed?: boolean
    overdue?: boolean
    priority?: string
}

export default function ActivityTimeline({ cardId }: ActivityTimelineProps) {
    const [filter, setFilter] = useState<'all' | 'tasks' | 'notes' | 'activities'>('all')

    // Fetch tasks
    const { data: tasks } = useQuery({
        queryKey: ['timeline-tasks', cardId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('tarefas')
                .select('*, profiles:responsavel_id(nome)')
                .eq('card_id', cardId)
                .order('data_vencimento', { ascending: false })

            if (error) throw error
            return data || []
        }
    })

    // Fetch notes
    const { data: notes } = useQuery({
        queryKey: ['timeline-notes', cardId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('notas')
                .select('*, profiles:autor_id(nome)')
                .eq('card_id', cardId)
                .order('created_at', { ascending: false })

            if (error) throw error
            return data || []
        }
    })

    // Fetch activities
    const { data: activities } = useQuery({
        queryKey: ['timeline-activities', cardId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('atividades')
                .select('*, profiles:created_by(nome)')
                .eq('card_id', cardId)
                .order('created_at', { ascending: false })
                .limit(20)

            if (error) throw error
            return data || []
        }
    })

    // Combine and sort timeline
    const timelineItems: Activity[] = [
        ...(tasks?.map((t: any) => ({
            id: t.id,
            type: 'task' as const,
            title: t.titulo,
            description: t.descricao,
            timestamp: t.data_vencimento,
            author: (t.profiles as any)?.nome,
            completed: t.concluida,
            overdue: !t.concluida && new Date(t.data_vencimento) < new Date(),
            priority: t.prioridade
        })) || []),
        ...(notes?.map((n: any) => ({
            id: n.id,
            type: 'note' as const,
            title: n.conteudo,
            timestamp: n.created_at || '',
            author: (n.profiles as any)?.nome
        })) || []),
        ...(activities?.map((a: any) => ({
            id: a.id,
            type: 'activity' as const,
            title: a.titulo,
            description: a.descricao,
            timestamp: a.created_at || '',
            author: (a.profiles as any)?.nome
        })) || [])
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const filteredItems = timelineItems.filter(item => {
        if (filter === 'all') return true
        if (filter === 'tasks') return item.type === 'task'
        if (filter === 'notes') return item.type === 'note'
        if (filter === 'activities') return item.type === 'activity'
        return true
    })

    const getIcon = (type: string) => {
        switch (type) {
            case 'task': return CheckSquare
            case 'note': return MessageCircle
            case 'activity': return Send
            default: return Clock
        }
    }

    return (
        <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Timeline de Atividades</h2>
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-400" />
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value as any)}
                        className="text-sm border-gray-300 rounded-md"
                    >
                        <option value="all">Tudo</option>
                        <option value="tasks">Tarefas</option>
                        <option value="notes">Notas</option>
                        <option value="activities">Atividades</option>
                    </select>
                </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
                {filteredItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">Nenhuma atividade ainda</p>
                    </div>
                ) : (
                    filteredItems.map((item) => {
                        const Icon = getIcon(item.type)
                        return (
                            <div key={item.id} className={cn(
                                "relative pl-8 pb-4 border-l-2",
                                item.type === 'task' && item.overdue ? "border-red-200" : "border-gray-200"
                            )}>
                                <div className={cn(
                                    "absolute left-0 -ml-2 h-4 w-4 rounded-full flex items-center justify-center",
                                    item.type === 'task' && item.overdue ? "bg-red-100" : "bg-white border-2 border-gray-300"
                                )}>
                                    <Icon className={cn(
                                        "h-2.5 w-2.5",
                                        item.type === 'task' && item.overdue ? "text-red-600" : "text-gray-400"
                                    )} />
                                </div>

                                <div className="rounded-lg border bg-white p-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                "text-sm font-medium",
                                                item.completed && "line-through text-gray-500",
                                                item.overdue && !item.completed && "text-red-700"
                                            )}>
                                                {item.title}
                                            </p>
                                            {item.description && (
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
                                            )}
                                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                <span>{item.author}</span>
                                                <span>•</span>
                                                <span>{new Date(item.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                {item.overdue && !item.completed && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-red-600 font-medium flex items-center gap-1">
                                                            <AlertCircle className="h-3 w-3" />
                                                            Atrasada
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {item.type === 'task' && !item.completed && (
                                            <button className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">
                                                Concluir
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
