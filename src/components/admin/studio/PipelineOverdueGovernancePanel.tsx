import { Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useOrg } from '../../../contexts/OrgContext'
import {
    usePipelineGovernance,
    useUpdatePipelineGovernanceSeverity,
    type DataOverdueSeverity,
} from '../../../hooks/usePipelineGovernance'

interface PipelineOverdueGovernancePanelProps {
    pipelineId: string | null | undefined
}

const OPTIONS: Array<{
    value: DataOverdueSeverity
    label: string
    description: string
}> = [
    {
        value: 'warn_only',
        label: 'Apenas aviso',
        description: 'Mostra um badge no card. Não bloqueia nada.',
    },
    {
        value: 'block_move',
        label: 'Bloqueia movimentação',
        description: 'Impede mudança de etapa até atualizar a data. Resto do card editável.',
    },
    {
        value: 'block_all',
        label: 'Bloqueia toda ação no card',
        description:
            'Abre modal full-screen no card pedindo atualização da data antes de qualquer edição.',
    },
]

/**
 * Painel admin para configurar o que acontece quando o Travel Planner deixa
 * a Data Prevista de Fechamento "vencer" (cliente atrasou pra fechar).
 *
 * Renderizado no topo do GovernanceConsole. Editável apenas por admins (RLS
 * já restringe escrita à org corrente).
 */
export default function PipelineOverdueGovernancePanel({
    pipelineId,
}: PipelineOverdueGovernancePanelProps) {
    const { org } = useOrg()
    const orgId = org?.id
    const { data: governance, isLoading } = usePipelineGovernance(pipelineId)
    const updateSeverity = useUpdatePipelineGovernanceSeverity()

    if (!pipelineId || !orgId) return null

    const currentSeverity: DataOverdueSeverity = governance?.data_overdue_severity ?? 'block_all'

    const handleChange = (severity: DataOverdueSeverity) => {
        if (severity === currentSeverity) return
        updateSeverity.mutate(
            { pipelineId, orgId, severity },
            {
                onSuccess: () => toast.success('Configuração salva'),
                onError: (err: Error) => toast.error(`Falha ao salvar: ${err.message}`),
            }
        )
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
            <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                        Quando a Data Prevista de Fechamento estiver atrasada
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Define como o sistema reage quando a data prevista de um card já passou e o
                        card ainda não foi marcado como ganho/perdido.
                    </p>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-2">
                {OPTIONS.map((opt) => {
                    const isSelected = currentSeverity === opt.value
                    return (
                        <button
                            key={opt.value}
                            onClick={() => handleChange(opt.value)}
                            disabled={isLoading || updateSeverity.isPending}
                            className={
                                'text-left px-3 py-2.5 rounded-lg border transition-all ' +
                                (isSelected
                                    ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50')
                            }
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <div
                                    className={
                                        'w-3 h-3 rounded-full border-2 ' +
                                        (isSelected
                                            ? 'border-indigo-500 bg-indigo-500'
                                            : 'border-gray-300 bg-white')
                                    }
                                />
                                <span
                                    className={
                                        'text-xs font-semibold ' +
                                        (isSelected ? 'text-indigo-900' : 'text-gray-900')
                                    }
                                >
                                    {opt.label}
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-snug pl-5">
                                {opt.description}
                            </p>
                        </button>
                    )
                })}
            </div>

            {updateSeverity.isPending && (
                <p className="text-[11px] text-gray-500 mt-2">Salvando...</p>
            )}
        </div>
    )
}
