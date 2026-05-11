import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { History } from 'lucide-react'

interface CardHistoryProps {
    cardId: string
}

export default function CardHistory({ cardId }: CardHistoryProps) {
    const { data: history, isLoading } = useQuery({
        queryKey: ['card-history', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('historico_fases')
                .select(`
            *,
            etapa_anterior:etapas_funil!etapa_anterior_id(nome),
            etapa_nova:etapas_funil!etapa_nova_id(nome),
            usuario:users!mudado_por(email)
        `)
                .eq('card_id', cardId)
                .order('data_mudanca', { ascending: false })

            if (error) throw error
            return data
        }
    })

    if (isLoading) return <div className="p-4 text-center text-sm text-gray-500">Carregando histórico...</div>

    if (!history || history.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-8 text-center">
                <History className="mx-auto h-8 w-8 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Sem histórico</h3>
                <p className="mt-1 text-sm text-gray-500">Nenhuma alteração de fase registrada.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 border-l-2 border-gray-200 ml-3 pl-6 py-2">
            {history.map((item: any) => (
                <div key={item.id} className="relative">
                    <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-white bg-indigo-600 ring-4 ring-gray-50" />
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-gray-900">
                            Mudou de <span className="font-bold">{item.etapa_anterior?.nome || 'Início'}</span> para <span className="font-bold text-indigo-600">{item.etapa_nova?.nome}</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{new Date(item.data_mudanca).toLocaleString('pt-BR')}</span>
                            <span>•</span>
                            <span>{item.usuario?.email || 'Sistema'}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
