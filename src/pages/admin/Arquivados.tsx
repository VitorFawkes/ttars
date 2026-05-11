import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Archive, RotateCcw, Trash2, Calendar, User, DollarSign, Loader2, AlertCircle, Package, CheckSquare, Square } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useArchiveCard } from '../../hooks/useArchiveCard'
import { useProductContext } from '../../hooks/useProductContext'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'

interface ArchivedCard {
    id: string
    titulo: string
    produto: string
    status_comercial: string
    valor_estimado: number | null
    valor_final: number | null
    archived_at: string
    archived_by: string | null
    pessoa_nome: string | null
    etapa_nome: string | null
    created_at: string
    archived_by_nome?: string | null
}

export default function Arquivados() {
    const { currentProduct } = useProductContext()
    const queryClient = useQueryClient()
    const { unarchive, isUnarchiving } = useArchiveCard()
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const { data: archivedCards, isLoading, error } = useQuery({
        queryKey: ['archived-cards', currentProduct],
        queryFn: async () => {
            // Query cards that are archived (have archived_at set)
            const { data, error } = await supabase
                .from('cards')
                .select('id, titulo, produto, status_comercial, valor_estimado, valor_final, archived_at, archived_by, created_at')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .eq('produto', currentProduct as any)
                .not('archived_at', 'is', null)
                .is('deleted_at', null)
                .order('archived_at', { ascending: false })

            if (error) throw error

            return (data || []).map((card: Record<string, unknown>) => ({
                id: card.id,
                titulo: card.titulo,
                produto: card.produto,
                status_comercial: card.status_comercial,
                valor_estimado: card.valor_estimado,
                valor_final: card.valor_final,
                archived_at: card.archived_at,
                archived_by: card.archived_by,
                pessoa_nome: null,
                etapa_nome: null,
                created_at: card.created_at,
                archived_by_nome: null
            })) as ArchivedCard[]
        }
    })

    // Hard delete mutation
    const hardDeleteMutation = useMutation({
        mutationFn: async (cardIds: string[]) => {
            const { error } = await supabase
                .from('cards')
                .delete()
                .in('id', cardIds)

            if (error) throw error
            return cardIds
        },
        onSuccess: (deletedIds) => {
            toast.success(`${deletedIds.length} card(s) excluído(s) permanentemente`)
            queryClient.invalidateQueries({ queryKey: ['archived-cards'] })
            setSelectedIds(new Set())
        },
        onError: (error: Error) => {
            toast.error('Erro ao excluir: ' + error.message)
        }
    })

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const productColors: Record<string, string> = {
        'TRIPS': 'bg-blue-50 text-blue-700 border-blue-200',
        'WEDDING': 'bg-pink-50 text-pink-700 border-pink-200',
        'CORP': 'bg-purple-50 text-purple-700 border-purple-200'
    }

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const selectAll = () => {
        if (selectedIds.size === archivedCards?.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(archivedCards?.map(c => c.id) || []))
        }
    }

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return
        if (!confirm(`Tem certeza que deseja excluir PERMANENTEMENTE ${selectedIds.size} card(s)? Esta ação não pode ser desfeita.`)) return
        hardDeleteMutation.mutate(Array.from(selectedIds))
    }

    const handleSingleDelete = (id: string) => {
        if (!confirm('Tem certeza que deseja excluir PERMANENTEMENTE este card? Esta ação não pode ser desfeita.')) return
        hardDeleteMutation.mutate([id])
    }

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="flex-none bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <Archive className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900">Arquivados</h1>
                            <p className="text-sm text-gray-500">
                                Cards arquivados que podem ser restaurados ou excluídos permanentemente
                            </p>
                        </div>
                    </div>

                    {/* Bulk actions */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                                {selectedIds.size} selecionado(s)
                            </span>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleBulkDelete}
                                disabled={hardDeleteMutation.isPending}
                                className="gap-2"
                            >
                                {hardDeleteMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                Excluir Permanentemente
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-red-500">
                        <AlertCircle className="h-12 w-12 mb-2" />
                        <p>Erro ao carregar cards arquivados</p>
                        <p className="text-sm text-gray-500 mt-1">{(error as Error).message}</p>
                    </div>
                ) : !archivedCards?.length ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Archive className="h-16 w-16 mb-4 opacity-50" />
                        <p className="text-lg font-medium text-gray-500">Nenhum card arquivado</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Cards arquivados aparecerão aqui
                        </p>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto">
                        {/* Select All */}
                        <div className="mb-4 flex items-center gap-2">
                            <button
                                onClick={selectAll}
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                            >
                                {selectedIds.size === archivedCards.length ? (
                                    <CheckSquare className="h-4 w-4 text-primary" />
                                ) : (
                                    <Square className="h-4 w-4" />
                                )}
                                Selecionar todos ({archivedCards.length})
                            </button>
                        </div>

                        <div className="grid gap-4">
                            {archivedCards.map((card) => (
                                <div
                                    key={card.id}
                                    className={cn(
                                        "bg-white rounded-xl border shadow-sm p-5 hover:shadow-md transition-shadow",
                                        selectedIds.has(card.id) ? "border-primary ring-1 ring-primary/20" : "border-gray-200"
                                    )}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Checkbox */}
                                        <button
                                            onClick={() => toggleSelect(card.id)}
                                            className="mt-1 text-gray-400 hover:text-gray-600"
                                        >
                                            {selectedIds.has(card.id) ? (
                                                <CheckSquare className="h-5 w-5 text-primary" />
                                            ) : (
                                                <Square className="h-5 w-5" />
                                            )}
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            {/* Product Badge & Title */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                                    productColors[card.produto] || 'bg-gray-50 text-gray-700 border-gray-200'
                                                )}>
                                                    {card.produto}
                                                </span>
                                                {card.status_comercial && (
                                                    <span className="text-xs text-gray-400">
                                                        • {card.status_comercial}
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="font-semibold text-gray-900 truncate">
                                                {card.titulo}
                                            </h3>

                                            {/* Metadata */}
                                            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
                                                {card.pessoa_nome && (
                                                    <span className="flex items-center gap-1">
                                                        <User className="h-3.5 w-3.5" />
                                                        {card.pessoa_nome}
                                                    </span>
                                                )}
                                                {(card.valor_final || card.valor_estimado) && (
                                                    <span className="flex items-center gap-1 text-gray-700 font-medium">
                                                        <DollarSign className="h-3.5 w-3.5" />
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.valor_final || card.valor_estimado || 0)}
                                                    </span>
                                                )}
                                                {card.etapa_nome && (
                                                    <span className="flex items-center gap-1">
                                                        <Package className="h-3.5 w-3.5" />
                                                        {card.etapa_nome}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Archive Info */}
                                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                                                <Calendar className="h-3.5 w-3.5" />
                                                <span>
                                                    Arquivado em {formatDate(card.archived_at)}
                                                    {card.archived_by_nome && ` por ${card.archived_by_nome}`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => unarchive(card.id)}
                                                disabled={isUnarchiving}
                                                className="gap-2"
                                            >
                                                {isUnarchiving ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="h-4 w-4" />
                                                )}
                                                Restaurar
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleSingleDelete(card.id)}
                                                disabled={hardDeleteMutation.isPending}
                                                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
