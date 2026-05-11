import { useState } from 'react'
import { AlertCircle, Calendar } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

interface OverdueDataPrevistaOverlayProps {
    cardId: string
    /** O objeto produto_data do card (necessário pra preservar outros campos no UPDATE) */
    produtoData: Record<string, unknown> | null | undefined
    /** Quantos dias a data está atrasada */
    diasAtraso: number
    onResolved?: () => void
}

const minDate = new Date().toISOString().split('T')[0]

/**
 * Modal full-screen exibido quando a Data Prevista de Fechamento do card está
 * no passado E a severidade do pipeline_governance_settings é 'block_all'.
 *
 * Trava todas as interações do card até o Travel Planner atualizar a data pra
 * uma nova data futura — ou navegar pra fora.
 */
export default function OverdueDataPrevistaOverlay({
    cardId,
    produtoData,
    diasAtraso,
    onResolved,
}: OverdueDataPrevistaOverlayProps) {
    const [novaData, setNovaData] = useState<string>('')
    const [erro, setErro] = useState<string>('')
    const queryClient = useQueryClient()

    const updateDataMutation = useMutation({
        mutationFn: async (data: string) => {
            const merged = { ...(produtoData || {}), data_prevista_fechamento: data }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('cards') as any)
                .update({ produto_data: merged })
                .eq('id', cardId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            toast.success('Data Prevista de Fechamento atualizada')
            onResolved?.()
        },
        onError: (err: Error) => {
            setErro(err.message || 'Falha ao atualizar a data')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setErro('')

        if (!novaData) {
            setErro('Escolha uma data')
            return
        }

        // Validação local (mesma do trigger SQL)
        const escolhida = new Date(novaData + 'T00:00:00')
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)

        if (escolhida < hoje) {
            setErro('A nova data não pode ser no passado')
            return
        }

        updateDataMutation.mutate(novaData)
    }

    return (
        <div className="absolute inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-red-300">
                <div className="bg-red-500 px-6 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">
                            Data Prevista atrasada
                        </h2>
                        <p className="text-red-100 text-xs">
                            {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} no passado
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    <p className="text-sm text-slate-700 leading-relaxed">
                        Este card está bloqueado porque a Data Prevista de Fechamento já passou.
                        Atualize para uma nova data futura para continuar trabalhando.
                    </p>

                    <div>
                        <label className="text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            Nova Data Prevista de Fechamento
                        </label>
                        <input
                            type="date"
                            value={novaData}
                            onChange={(e) => {
                                setNovaData(e.target.value)
                                setErro('')
                            }}
                            min={minDate}
                            required
                            autoFocus
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        />
                        {erro && (
                            <p className="text-xs text-red-600 mt-1.5">{erro}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={updateDataMutation.isPending || !novaData}
                        className="w-full px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
                    >
                        {updateDataMutation.isPending ? 'Atualizando...' : 'Atualizar data e continuar'}
                    </button>
                </form>
            </div>
        </div>
    )
}
