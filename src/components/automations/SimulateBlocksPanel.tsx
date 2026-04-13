import { useEffect, useMemo, useState } from 'react'
import { PlayCircle, CheckCircle2, User, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import type { Block } from '@/pages/admin/cadence/components/BlockEditor'
import { formatDueOffset } from '@/pages/admin/cadence/lib/dueOffsetCodec'

interface Props {
    blocks: Block[]
    /** Nome do produto atual, usado pra filtrar os cards listados */
    currentProduct: string | null | undefined
    /** Mapa user_id → nome, usado pra renderizar o responsável quando `specific` */
    userNameById: Map<string, string>
}

interface RecentCard {
    id: string
    titulo: string
    stage?: string
    dono_atual_id: string | null
}

/**
 * Simulador puramente local: lista os últimos 10 cards do produto atual e,
 * quando um é escolhido, mostra quais tarefas a automação criaria bloco a
 * bloco. Nada é salvo nem enviado — só preview.
 */
export function SimulateBlocksPanel({ blocks, currentProduct, userNameById }: Props) {
    const [recentCards, setRecentCards] = useState<RecentCard[]>([])
    const [selectedCardId, setSelectedCardId] = useState<string>('')
    const [simulated, setSimulated] = useState(false)

    useEffect(() => {
        const load = async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase as any)
                .from('cards')
                .select('id, titulo, dono_atual_id, pipeline_stages:pipeline_stage_id(nome)')
                .order('created_at', { ascending: false })
                .limit(10)
            if (currentProduct) q = q.eq('produto', currentProduct)
            const { data } = await q
            setRecentCards(
                (data || []).map(
                    (c: {
                        id: string
                        titulo: string
                        dono_atual_id: string | null
                        pipeline_stages?: { nome: string } | null
                    }) => ({
                        id: c.id,
                        titulo: c.titulo,
                        stage: c.pipeline_stages?.nome,
                        dono_atual_id: c.dono_atual_id,
                    }),
                ),
            )
        }
        load()
    }, [currentProduct])

    const selectedCard = useMemo(
        () => recentCards.find((c) => c.id === selectedCardId) || null,
        [recentCards, selectedCardId],
    )

    const totalTasks = blocks.reduce((acc, b) => acc + b.tasks.length, 0)

    const resolveAssignee = (task: Block['tasks'][number]): string => {
        if (task.assign_to === 'specific' && task.assign_to_user_id) {
            return userNameById.get(task.assign_to_user_id) || 'Pessoa específica'
        }
        if (selectedCard?.dono_atual_id) {
            return userNameById.get(selectedCard.dono_atual_id) || 'Dono do card'
        }
        return 'Dono do card'
    }

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-indigo-600" />
                    Simular antes de ativar
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                    Escolha um card real e veja o que essa automação faria.{' '}
                    <strong>Nada é criado ou enviado.</strong>
                </p>
            </div>

            <div className="flex gap-2">
                <Select
                    value={selectedCardId}
                    onChange={(v) => {
                        setSelectedCardId(v)
                        setSimulated(false)
                    }}
                    options={[
                        { value: '', label: 'Selecione um card...' },
                        ...recentCards.map((c) => ({
                            value: c.id,
                            label: c.stage ? `${c.titulo} — ${c.stage}` : c.titulo,
                        })),
                    ]}
                />
                <Button
                    onClick={() => setSimulated(true)}
                    disabled={!selectedCardId || totalTasks === 0}
                >
                    Simular
                </Button>
            </div>

            {simulated && selectedCard && totalTasks > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">
                        Tarefas que seriam criadas no card{' '}
                        <span className="text-slate-700 font-medium">"{selectedCard.titulo}"</span>
                    </p>

                    <ol className="space-y-3">
                        {blocks.map((block, idx) => (
                            <li key={block.id} className="flex gap-3">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold shrink-0 mt-0.5">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 space-y-1.5">
                                    <p className="text-xs text-slate-500">
                                        {idx === 0 || block.startsFromTrigger
                                            ? 'Criadas imediatamente'
                                            : `Criadas quando o bloco ${
                                                  (block.dependsOnBlock ?? idx - 1) + 1
                                              } for concluído`}
                                    </p>
                                    {block.tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm"
                                        >
                                            <div className="flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-900 font-medium">
                                                        {task.titulo || '(sem título)'}
                                                    </p>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                        <span className="inline-flex items-center gap-1">
                                                            <User className="w-3 h-3" />
                                                            {resolveAssignee(task)}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {formatDueOffset(task.due_offset)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    )
}
