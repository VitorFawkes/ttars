import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Search, Users, Plus, Calendar, Check, Loader2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import CreateGroupModal from './CreateGroupModal'

interface LinkToGroupModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    cardTitle: string
}

export default function LinkToGroupModal({ isOpen, onClose, cardId, cardTitle }: LinkToGroupModalProps) {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
    const [showCreateGroup, setShowCreateGroup] = useState(false)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
        return () => clearTimeout(timer)
    }, [searchTerm])

    // Reset state when modal opens
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setSearchTerm('')
            setDebouncedSearch('')
            setSelectedGroupId(null)
            setShowCreateGroup(false)
        }
    }, [isOpen])
    /* eslint-enable react-hooks/set-state-in-effect */

    // Search groups
    const { data: groups, isLoading } = useQuery({
        queryKey: ['groups-search', debouncedSearch],
        queryFn: async () => {
            let query = supabase
                .from('cards')
                .select('id, titulo, data_viagem_inicio, data_viagem_fim, group_total_pax, group_capacity, status_comercial')
                .eq('is_group_parent', true)
                .neq('id', cardId)
                .order('created_at', { ascending: false })
                .limit(20)

            if (debouncedSearch.length > 0) {
                query = query.ilike('titulo', `%${debouncedSearch}%`)
            }

            const { data, error } = await query
            if (error) throw error
            return data
        },
        enabled: isOpen
    })

    // Link mutation
    const linkMutation = useMutation({
        mutationFn: async (groupId: string) => {
            const { error } = await supabase
                .from('cards')
                .update({ parent_card_id: groupId })
                .eq('id', cardId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['groups-gallery'] })
            onClose()
        }
    })

    const handleLink = () => {
        if (selectedGroupId) {
            linkMutation.mutate(selectedGroupId)
        }
    }

    // After creating a new group, auto-link the card to it
    const handleGroupCreated = (groupId: string) => {
        setShowCreateGroup(false)
        linkMutation.mutate(groupId)
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return null
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    return (
        <>
            <Dialog open={isOpen && !showCreateGroup} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Users className="w-5 h-5 text-indigo-600" />
                            Vincular a um Grupo
                        </DialogTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            Vincule <span className="font-medium text-slate-700">{cardTitle}</span> a um grupo existente ou crie um novo.
                        </p>
                    </DialogHeader>

                    <div className="space-y-3 py-3">
                        {/* Search + Create new */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar grupo..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                    autoFocus
                                />
                            </div>
                            <Button
                                variant="outline"
                                className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 shrink-0"
                                onClick={() => setShowCreateGroup(true)}
                            >
                                <Plus className="w-4 h-4 mr-1.5" />
                                Novo Grupo
                            </Button>
                        </div>

                        {/* Groups list */}
                        <div className="min-h-[200px] max-h-[360px] overflow-y-auto border border-slate-100 rounded-lg bg-white">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Buscando grupos...
                                </div>
                            ) : groups?.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-[200px] text-slate-400 text-sm p-4">
                                    <Users className="w-10 h-10 mb-3 opacity-30" />
                                    <p className="font-medium text-slate-500">Nenhum grupo encontrado</p>
                                    <p className="text-xs mt-1">Crie um novo grupo para vincular este card.</p>
                                    <Button
                                        variant="outline"
                                        className="mt-4 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                        onClick={() => setShowCreateGroup(true)}
                                    >
                                        <Plus className="w-4 h-4 mr-1.5" />
                                        Criar Novo Grupo
                                    </Button>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {groups?.map((group) => {
                                        const isSelected = selectedGroupId === group.id
                                        const pax = group.group_total_pax || 0
                                        const capacity = group.group_capacity || 0
                                        return (
                                            <div
                                                key={group.id}
                                                onClick={() => setSelectedGroupId(isSelected ? null : group.id)}
                                                className={cn(
                                                    "p-3 cursor-pointer transition-colors hover:bg-indigo-50/50 flex items-center justify-between select-none",
                                                    isSelected && "bg-indigo-50 border-l-4 border-indigo-500",
                                                    !isSelected && "border-l-4 border-transparent"
                                                )}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className={cn(
                                                        "font-medium truncate",
                                                        isSelected ? "text-indigo-700" : "text-slate-900"
                                                    )}>
                                                        {group.titulo}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                        {group.data_viagem_inicio && (
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" />
                                                                {formatDate(group.data_viagem_inicio)}
                                                                {group.data_viagem_fim && ` — ${formatDate(group.data_viagem_fim)}`}
                                                            </span>
                                                        )}
                                                        <span className="flex items-center gap-1">
                                                            <Users className="w-3 h-3" />
                                                            {pax}{capacity > 0 ? `/${capacity}` : ''} pax
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "h-6 w-6 rounded-full flex items-center justify-center border transition-all shrink-0 ml-3",
                                                    isSelected
                                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                                        : "border-slate-300 bg-white"
                                                )}>
                                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {linkMutation.isError && (
                            <p className="text-red-500 text-sm">
                                Erro ao vincular: {(linkMutation.error as Error).message}
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} disabled={linkMutation.isPending}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleLink}
                            disabled={!selectedGroupId || linkMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {linkMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Vinculando...
                                </>
                            ) : (
                                'Vincular ao Grupo'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Group Modal (inline) */}
            <CreateGroupModal
                isOpen={showCreateGroup}
                onClose={() => setShowCreateGroup(false)}
                onSuccess={handleGroupCreated}
            />
        </>
    )
}
