import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import ActivityFeed from '../components/card/ActivityFeed'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Filter, X } from 'lucide-react'

export default function ActivitiesPage() {
    const [filters, setFilters] = useState({
        userId: 'all',
        startDate: '',
        endDate: '',
        type: 'all'
    })

    // Fetch users for filter
    const { data: users } = useQuery({
        queryKey: ['users-list'],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, nome, email')
                .order('nome')
            return data || []
        }
    })

    const userOptions = [
        { value: 'all', label: 'Todos os usuários' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- profiles query returns untyped rows
        ...((users as any[] || []).map((u: { id: string; nome: string | null; email: string | null }) => ({ value: u.id, label: u.nome || u.email || 'Sem nome' })))
    ]



    const typeOptions = [
        { value: 'all', label: 'Todos os tipos' },
        { value: 'card_created', label: 'Card Criado' },
        { value: 'stage_changed', label: 'Mudança de Fase' },
        { value: 'owner_changed', label: 'Mudança de Dono' },
        { value: 'whatsapp_sent', label: 'WhatsApp Enviado' },
        { value: 'note_added', label: 'Nota Adicionada' },
        { value: 'task_completed', label: 'Tarefa Concluída' },
        { value: 'ai_summary_updated', label: 'Resumo IA Atualizado' },
        { value: 'ai_context_updated', label: 'Contexto IA Atualizado' },
        { value: 'ai_handoff', label: 'Handoff IA/Humano' },
        { value: 'title_changed', label: 'Título Alterado' },
        { value: 'budget_changed', label: 'Orçamento Alterado' },
        { value: 'notes_changed', label: 'Informações Importantes' },
    ]

    const clearFilters = () => {
        setFilters({
            userId: 'all',
            startDate: '',
            endDate: '',
            type: 'all'
        })
    }

    const hasActiveFilters = filters.userId !== 'all' || filters.startDate || filters.endDate || filters.type !== 'all'

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <h1 className="text-2xl font-bold text-gray-900">Atividades Recentes</h1>

                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                            className="text-gray-500 hover:text-gray-700 self-start sm:self-auto"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Limpar Filtros
                        </Button>
                    )}
                </div>

                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                    <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
                        <Filter className="w-4 h-4" />
                        Filtros
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Usuário</label>
                            <Select
                                value={filters.userId}
                                onChange={(value) => setFilters(prev => ({ ...prev, userId: value }))}
                                options={userOptions}
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                            <Select
                                value={filters.type}
                                onChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
                                options={typeOptions}
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Data Início</label>
                            <Input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Data Fim</label>
                            <Input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                className="w-full"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <ActivityFeed filters={filters} />
                </div>
            </div>
        </div>
    )
}
