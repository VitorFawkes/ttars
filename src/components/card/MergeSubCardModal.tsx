import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import {
    GitMerge,
    Plus,
    ArrowRight,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    ArrowDownToLine,
    Replace,
    FileText,
    MapPin,
    Loader2
} from 'lucide-react'
import { useSubCards, type SubCard, type MergeConfig } from '@/hooks/useSubCards'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface MergeSubCardModalProps {
    isOpen: boolean
    onClose: () => void
    subCard: SubCard
    parentValor?: number | null
    parentCardId?: string
}

export default function MergeSubCardModal({
    isOpen,
    onClose,
    subCard,
    parentValor,
    parentCardId
}: MergeSubCardModalProps) {
    const { mergeSubCard, isMerging } = useSubCards()
    const [confirmed, setConfirmed] = useState(false)

    // Merge config — editable, starts from sub-card's stored config
    const fallbackConfig: MergeConfig = {
        texto: { copiar_pai: true, merge_mode: 'replace' },
        viagem: { copiar_pai: true, merge_mode: 'replace' }
    }
    const [mergeConfig, setMergeConfig] = useState<MergeConfig>(subCard.merge_config || fallbackConfig)

    // Reset state when subCard changes (render-time pattern)
    const [prevSubCardId, setPrevSubCardId] = useState(subCard.id)
    if (prevSubCardId !== subCard.id) {
        setPrevSubCardId(subCard.id)
        setConfirmed(false)
        setMergeConfig(subCard.merge_config || fallbackConfig)
    }

    // Fetch parent card data for preview
    const resolvedParentId = parentCardId || undefined
    const parentQuery = useQuery({
        queryKey: ['merge-parent-data', resolvedParentId],
        enabled: isOpen && !!resolvedParentId,
        queryFn: async () => {
            if (!resolvedParentId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types pendentes de regeneracao
            const { data, error } = await (supabase as any)
                .from('cards')
                .select('briefing_inicial, produto_data')
                .eq('id', resolvedParentId)
                .single()
            if (error) throw error
            return data as {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                briefing_inicial: any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                produto_data: any
            }
        }
    })

    const isIncremental = subCard.sub_card_mode === 'incremental'
    const subCardValue = subCard.valor_final ?? subCard.valor_estimado ?? 0
    const parentValue = parentValor ?? 0
    const newValue = isIncremental ? parentValue + subCardValue : subCardValue

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const handleMerge = () => {
        mergeSubCard(
            { subCardId: subCard.id, mergeConfigOverride: mergeConfig },
            { onSuccess: () => onClose() }
        )
    }

    // Preview helpers
    const parentObs = parentQuery.data?.produto_data?.observacoes || ''
    const parentDestinos = parentQuery.data?.produto_data?.destinos as string[] | undefined

    const truncate = (text: string, max: number) =>
        text.length > max ? text.slice(0, max) + '...' : text

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[540px] bg-white border-gray-200 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl text-gray-900">
                        <GitMerge className={cn(
                            'w-5 h-5',
                            isIncremental ? 'text-orange-500' : 'text-blue-500'
                        )} />
                        Concluir Alteração
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-3">
                    {/* Sub-card info */}
                    <div className={cn(
                        'p-3 rounded-lg border-l-4',
                        isIncremental
                            ? 'bg-orange-50 border-orange-500'
                            : 'bg-blue-50 border-blue-500'
                    )}>
                        <div className="flex items-center gap-2 mb-1">
                            {isIncremental ? (
                                <Plus className="w-4 h-4 text-orange-600" />
                            ) : (
                                <RefreshCw className="w-4 h-4 text-blue-600" />
                            )}
                            <span className={cn(
                                'text-sm font-semibold',
                                isIncremental ? 'text-orange-700' : 'text-blue-700'
                            )}>
                                {subCard.titulo}
                            </span>
                        </div>
                        <p className="text-xs text-gray-600">
                            Modo: {isIncremental ? 'Adicional (soma)' : 'Revisão (substitui)'}
                        </p>
                    </div>

                    {/* Value calculation */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700">Cálculo do Valor</h4>
                        {isIncremental ? (
                            <div className="flex items-center justify-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 mb-1">Card Principal</p>
                                    <p className="text-lg font-semibold text-gray-700">{formatCurrency(parentValue)}</p>
                                </div>
                                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-100">
                                    <Plus className="w-3.5 h-3.5 text-orange-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 mb-1">Alteração</p>
                                    <p className="text-lg font-semibold text-orange-600">{formatCurrency(subCardValue)}</p>
                                </div>
                                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200">
                                    <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 mb-1">Novo Total</p>
                                    <p className="text-xl font-bold text-green-600">{formatCurrency(newValue)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 mb-1">Valor Atual</p>
                                    <p className="text-lg font-semibold text-gray-400 line-through">{formatCurrency(parentValue)}</p>
                                </div>
                                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100">
                                    <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 mb-1">Novo Valor</p>
                                    <p className="text-xl font-bold text-blue-600">{formatCurrency(newValue)}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ════════════════════════════════════ */}
                    {/* Merge de Conteúdo — editable config */}
                    {/* ════════════════════════════════════ */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-700">Merge de Conteúdo</h4>

                        {parentQuery.isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
                                <span className="text-xs text-gray-500">Carregando dados do card pai...</span>
                            </div>
                        ) : (
                            <>
                                {/* Grupo Texto */}
                                <MergeGroupToggle
                                    icon={<FileText className="w-3.5 h-3.5" />}
                                    label="Texto"
                                    description="Observações + Briefing"
                                    mode={mergeConfig.texto.merge_mode}
                                    onModeChange={(m) => setMergeConfig(prev => ({
                                        ...prev,
                                        texto: { ...prev.texto, merge_mode: m }
                                    }))}
                                    accentColor={isIncremental ? 'orange' : 'blue'}
                                    preview={parentObs ? (
                                        mergeConfig.texto.merge_mode === 'append' ? (
                                            <div className="text-xs text-gray-600 space-y-1">
                                                <p className="text-gray-400 italic">{truncate(parentObs, 80)}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">--- Alteração: {subCard.titulo} ---</p>
                                                <p className="text-gray-700 font-medium">+ texto do card de alteração</p>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-600 space-y-1">
                                                <p className="text-gray-400 line-through italic">{truncate(parentObs, 60)}</p>
                                                <p className="text-gray-700 font-medium">→ substituído pelo texto da alteração</p>
                                            </div>
                                        )
                                    ) : (
                                        <p className="text-xs text-gray-400 italic">Card pai sem observações</p>
                                    )}
                                />

                                {/* Grupo Viagem */}
                                <MergeGroupToggle
                                    icon={<MapPin className="w-3.5 h-3.5" />}
                                    label="Viagem"
                                    description="Destinos, Orçamento, Época..."
                                    mode={mergeConfig.viagem.merge_mode}
                                    onModeChange={(m) => setMergeConfig(prev => ({
                                        ...prev,
                                        viagem: { ...prev.viagem, merge_mode: m }
                                    }))}
                                    accentColor={isIncremental ? 'orange' : 'blue'}
                                    preview={parentDestinos && parentDestinos.length > 0 ? (
                                        mergeConfig.viagem.merge_mode === 'append' ? (
                                            <p className="text-xs text-gray-600">
                                                Destinos atuais ({parentDestinos.join(', ')}) + novos destinos da alteração
                                            </p>
                                        ) : (
                                            <p className="text-xs text-gray-600">
                                                Destinos <span className="line-through text-gray-400">{parentDestinos.join(', ')}</span> → substituídos
                                            </p>
                                        )
                                    ) : (
                                        <p className="text-xs text-gray-400 italic">Campos de viagem serão atualizados</p>
                                    )}
                                />
                            </>
                        )}
                    </div>

                    {/* Warning */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-amber-800 font-medium">Esta ação não pode ser desfeita</p>
                            <p className="text-xs text-amber-700 mt-1">
                                O card de alteração será marcado como concluído e os dados do card principal serão atualizados.
                            </p>
                        </div>
                    </div>

                    {/* Confirmation checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className={cn(
                                'w-4 h-4 rounded border-gray-300',
                                isIncremental
                                    ? 'text-orange-600 focus:ring-orange-500'
                                    : 'text-blue-600 focus:ring-blue-500'
                            )}
                        />
                        <span className="text-sm text-gray-700">
                            Confirmo que desejo concluir esta alteração
                        </span>
                    </label>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isMerging}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleMerge}
                        disabled={!confirmed || isMerging}
                        className={cn(
                            'text-white',
                            isIncremental
                                ? 'bg-orange-600 hover:bg-orange-700'
                                : 'bg-blue-600 hover:bg-blue-700'
                        )}
                    >
                        {isMerging ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Processando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Concluir Alteração
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ═══════════════════════════════════════════════════════════
// MergeGroupToggle — per-group merge mode selector with preview
// ═══════════════════════════════════════════════════════════

interface MergeGroupToggleProps {
    icon: React.ReactNode
    label: string
    description: string
    mode: 'replace' | 'append'
    onModeChange: (mode: 'replace' | 'append') => void
    accentColor: 'orange' | 'blue'
    preview: React.ReactNode
}

function MergeGroupToggle({ icon, label, description, mode, onModeChange, accentColor, preview }: MergeGroupToggleProps) {
    const accent = accentColor === 'orange'
        ? { bg: 'bg-orange-50', border: 'border-orange-200', active: 'bg-orange-100 border-orange-400 text-orange-800' }
        : { bg: 'bg-blue-50', border: 'border-blue-200', active: 'bg-blue-100 border-blue-400 text-blue-800' }

    return (
        <div className={cn('p-3 rounded-lg border', accent.border, accent.bg)}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">{icon}</span>
                    <span className="text-sm font-semibold text-gray-700">{label}</span>
                    <span className="text-xs text-gray-500">({description})</span>
                </div>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => onModeChange('append')}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors',
                            mode === 'append'
                                ? accent.active
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        )}
                    >
                        <ArrowDownToLine className="w-3 h-3" />
                        Acrescentar
                    </button>
                    <button
                        type="button"
                        onClick={() => onModeChange('replace')}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors',
                            mode === 'replace'
                                ? accent.active
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        )}
                    >
                        <Replace className="w-3 h-3" />
                        Substituir
                    </button>
                </div>
            </div>
            {/* Preview */}
            <div className="mt-2 p-2 bg-white/60 rounded border border-gray-100">
                {preview}
            </div>
        </div>
    )
}
