import { useState, useMemo } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Tables']['cards']['Row'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    briefing_inicial?: any | null
}

interface ResumoIAProps {
    card: Card
}

function formatWhen(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * Bloco read-only com o resumo gerado pela IA a partir da última transcrição.
 * Mora em `resumo_consultor` (área separada) — a IA nunca escreve nas observações
 * do usuário. Não renderiza nada quando não há resumo.
 */
export default function ResumoIA({ card }: ResumoIAProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productData = (card.produto_data as any) || {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const briefingData = (card.briefing_inicial as any) || {}

    const resumo = useMemo<string>(() => {
        const r = productData.resumo_consultor || briefingData.resumo_consultor
        return typeof r === 'string' ? r.trim() : ''
    }, [productData.resumo_consultor, briefingData.resumo_consultor])

    const resumoAt = useMemo<string>(() => {
        const at = productData.resumo_consultor_at || briefingData.resumo_consultor_at
        return formatWhen(typeof at === 'string' ? at : null)
    }, [productData.resumo_consultor_at, briefingData.resumo_consultor_at])

    const [expanded, setExpanded] = useState(false)

    if (!resumo) return null

    return (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 shadow-sm overflow-hidden mb-2">
            <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 bg-indigo-100 rounded-lg flex-shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-gray-900">Resumo da IA</h3>
                        {resumoAt && (
                            <p className="text-[10px] text-gray-500 leading-tight">Última reunião · {resumoAt}</p>
                        )}
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
            </button>

            {expanded && (
                <div className="px-3 pb-3">
                    <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed max-h-64 overflow-y-auto rounded-lg bg-white border border-indigo-100 p-2.5">
                        {resumo}
                    </p>
                    <p className="mt-1.5 text-[10px] text-gray-400">
                        Gerado pela IA a partir da transcrição. Suas observações acima não são alteradas.
                    </p>
                </div>
            )}
        </div>
    )
}
