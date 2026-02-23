import { useState, useEffect, useRef, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { Plus, User, X, Loader2, ChevronDown, Check, Megaphone, Users, Wallet, PenTool, MoreHorizontal, Search } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import ContactSelector from '../card/ContactSelector'
import OwnerSelector from './OwnerSelector'
import { Input } from '../ui/Input'
import { useAuth } from '../../contexts/AuthContext'
import { useAllowedStages } from '../../hooks/useCardCreationRules'
import { useToast } from '../../contexts/ToastContext'
import type { Database } from '../../database.types'
import { ORIGEM_OPTIONS, needsOrigemDetalhe } from '../../lib/constants/origem'

type Product = Database['public']['Enums']['app_product']

interface CreateCardModalProps {
    isOpen: boolean
    onClose: () => void
}

// RequiredFields interface removed - no fields are required for card creation

interface AllowedStage {
    id: string
    nome: string
    ordem: number
    fase: string | null
}

interface QuickStageSelectorProps {
    stages: AllowedStage[]
    selectedStageId: string | null
    onSelect: (stageId: string) => void
    showMore: boolean
    onToggleMore: () => void
}

// Phase colors for visual differentiation
const PHASE_COLORS: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
    'SDR': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', activeBg: 'bg-blue-100' },
    'Planner': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', activeBg: 'bg-purple-100' },
    'Pós-venda': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', activeBg: 'bg-emerald-100' },
    'default': { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', activeBg: 'bg-slate-100' }
}

function QuickStageSelector({ stages, selectedStageId, onSelect, showMore, onToggleMore }: QuickStageSelectorProps) {
    // Group stages by phase and get the first stage of each phase
    const { quickOptions, allGrouped, hasMoreOptions } = useMemo(() => {
        const grouped = stages.reduce((acc, stage) => {
            const phase = stage.fase || 'Outros'
            if (!acc[phase]) acc[phase] = []
            acc[phase].push(stage)
            return acc
        }, {} as Record<string, AllowedStage[]>)

        // Sort each group by ordem
        Object.values(grouped).forEach(group => group.sort((a, b) => a.ordem - b.ordem))

        // Get first stage of each phase (in phase order: SDR, Planner, Pós-venda)
        const phaseOrder = ['SDR', 'Planner', 'Pós-venda']
        const quickOpts: { stage: AllowedStage; phase: string }[] = []

        phaseOrder.forEach(phase => {
            if (grouped[phase]?.length > 0) {
                quickOpts.push({ stage: grouped[phase][0], phase })
            }
        })

        // Add any other phases not in the standard order
        Object.keys(grouped).forEach(phase => {
            if (!phaseOrder.includes(phase) && grouped[phase]?.length > 0) {
                quickOpts.push({ stage: grouped[phase][0], phase })
            }
        })

        // Check if there are more stages than just the quick options
        const totalQuickStages = quickOpts.length
        const totalStages = stages.length
        const hasMore = totalStages > totalQuickStages

        return { quickOptions: quickOpts, allGrouped: grouped, hasMoreOptions: hasMore }
    }, [stages])

    const getPhaseColors = (phase: string) => PHASE_COLORS[phase] || PHASE_COLORS['default']

    // Check if selected stage is one of the quick options
    const selectedIsQuickOption = quickOptions.some(opt => opt.stage.id === selectedStageId)
    const selectedStage = stages.find(s => s.id === selectedStageId)

    return (
        <div className="space-y-3">
            {/* Quick option chips - First stage of each phase */}
            <div className="flex flex-wrap gap-2">
                {quickOptions.map(({ stage, phase }) => {
                    const colors = getPhaseColors(phase)
                    const isSelected = selectedStageId === stage.id

                    return (
                        <button
                            key={stage.id}
                            type="button"
                            onClick={() => onSelect(stage.id)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200',
                                'hover:shadow-sm active:scale-[0.98]',
                                isSelected
                                    ? `${colors.activeBg} ${colors.border} ring-2 ring-offset-1 ring-indigo-500`
                                    : `${colors.bg} ${colors.border} hover:border-slate-300`
                            )}
                        >
                            {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                            <span className="text-xs font-medium text-slate-500">{phase}</span>
                            <span className={cn('text-sm font-medium', isSelected ? 'text-slate-900' : colors.text)}>
                                {stage.nome}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Show selected stage if it's not a quick option */}
            {!selectedIsQuickOption && selectedStage && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 ring-2 ring-offset-1 ring-indigo-500">
                    <Check className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="text-xs font-medium text-slate-500">{selectedStage.fase || 'Outros'}</span>
                    <span className="text-sm font-medium text-slate-900">{selectedStage.nome}</span>
                </div>
            )}

            {/* Expandable section for more stages */}
            {hasMoreOptions && (
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={onToggleMore}
                        className={cn(
                            'flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors',
                            'py-1 px-2 -mx-2 rounded hover:bg-slate-50'
                        )}
                    >
                        <ChevronDown className={cn(
                            'h-4 w-4 transition-transform duration-200',
                            showMore && 'rotate-180'
                        )} />
                        {showMore ? 'Ocultar outras etapas' : 'Ver outras etapas'}
                    </button>

                    {showMore && (
                        <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                            {Object.entries(allGrouped).map(([phase, phaseStages]) => {
                                // Skip stages already shown as quick options (first of each phase)
                                const otherStages = phaseStages.slice(1)
                                if (otherStages.length === 0) return null

                                const colors = getPhaseColors(phase)

                                return (
                                    <div key={phase} className="space-y-1.5">
                                        <p className={cn('text-xs font-medium', colors.text)}>{phase}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {otherStages.map(stage => {
                                                const isSelected = selectedStageId === stage.id
                                                return (
                                                    <button
                                                        key={stage.id}
                                                        type="button"
                                                        onClick={() => onSelect(stage.id)}
                                                        className={cn(
                                                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm transition-all duration-200',
                                                            'hover:shadow-sm active:scale-[0.98]',
                                                            isSelected
                                                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-1 ring-indigo-500'
                                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                                        )}
                                                    >
                                                        {isSelected && <Check className="h-3 w-3" />}
                                                        {stage.nome}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


export default function CreateCardModal({ isOpen, onClose }: CreateCardModalProps) {
    const queryClient = useQueryClient()
    const contentRef = useRef<HTMLDivElement>(null)
    const [showContactSelector, setShowContactSelector] = useState(false)
    const [showMoreStages, setShowMoreStages] = useState(false)

    // Scroll to top when modal opens or when returning from ContactSelector
    useEffect(() => {
        if (isOpen && !showContactSelector && contentRef.current) {
            contentRef.current.scrollTop = 0
        }
    }, [isOpen, showContactSelector])

    const { profile } = useAuth()

    // Helper to get initial owner values based on user's team phase (not role)
    // A fase do time determina qual coluna de owner é preenchida automaticamente
    // Admin/gestor sem time → default Planner
    const initialOwners = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- team join pendente de types regeneration
        const phaseSlug = (profile as any)?.team?.phase?.slug as string | undefined
        const isAdmin = profile?.is_admin === true
        const effectivePhase = phaseSlug ?? (isAdmin ? 'planner' : undefined)
        const userId = profile?.id || null
        const userName = profile?.nome || null

        return {
            sdr_owner_id: effectivePhase === 'sdr' ? userId : null,
            sdr_owner_nome: effectivePhase === 'sdr' ? userName : null,
            vendas_owner_id: effectivePhase === 'planner' ? userId : null,
            vendas_owner_nome: effectivePhase === 'planner' ? userName : null,
            pos_owner_id: effectivePhase === 'pos_venda' ? userId : null,
            pos_owner_nome: effectivePhase === 'pos_venda' ? userName : null,
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any
    }, [(profile as any)?.team?.phase?.slug, profile?.is_admin, profile?.id, profile?.nome])

    // Core form data
    const [formData, setFormData] = useState({
        titulo: '',
        produto: 'TRIPS' as Product,
        pessoa_principal_id: null as string | null,
        pessoa_principal_nome: null as string | null,
        sdr_owner_id: null as string | null,
        sdr_owner_nome: null as string | null,
        vendas_owner_id: null as string | null,
        vendas_owner_nome: null as string | null,
        pos_owner_id: null as string | null,
        pos_owner_nome: null as string | null,
        selectedStageId: null as string | null,
        origem: 'manual' as string,
        origem_lead: null as string | null
    })

    // Indicação autocomplete state
    const [indicacaoSearch, setIndicacaoSearch] = useState('')
    const [debouncedIndicacao, setDebouncedIndicacao] = useState('')
    const [showIndicacaoResults, setShowIndicacaoResults] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedIndicacao(indicacaoSearch), 300)
        return () => clearTimeout(timer)
    }, [indicacaoSearch])

    const { data: indicacaoContacts } = useQuery({
        queryKey: ['indicacao-search', debouncedIndicacao],
        queryFn: async () => {
            if (!debouncedIndicacao) return []
            const { data, error } = await supabase
                .from('contatos')
                .select('id, nome, telefone, email')
                .is('deleted_at', null)
                .or(`nome.ilike.%${debouncedIndicacao}%,email.ilike.%${debouncedIndicacao}%`)
                .limit(5)
            if (error) throw error
            return data
        },
        enabled: debouncedIndicacao.length > 2
    })

    // Dynamic fields stored in briefing_inicial (for future use)
    const [dynamicFields] = useState<Record<string, unknown>>({})

    // Get allowed stages for user's team
    const { allowedStages, isLoading: loadingStages, isAdmin } = useAllowedStages(formData.produto)

    // Derived: effective stage ID (user selection or first available)
    const effectiveStageId = formData.selectedStageId ?? (allowedStages.length > 0 ? allowedStages[0].id : null)

    // Track last isOpen state to detect modal opening
    const wasOpenRef = useRef(false)

    // Reset form with auto-filled owners when modal opens
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            // Modal just opened - reset with initial owners based on user's role
            setFormData({
                titulo: '',
                produto: 'TRIPS',
                pessoa_principal_id: null,
                pessoa_principal_nome: null,
                ...initialOwners,
                selectedStageId: null,
                origem: 'manual',
                origem_lead: null
            })
            setIndicacaoSearch('')
        }
        wasOpenRef.current = isOpen
    }, [isOpen, initialOwners])


    // Get pipeline ID for the selected product
    const { data: pipeline } = useQuery({
        queryKey: ['pipeline-for-product', formData.produto],
        queryFn: async () => {
            const { data } = await supabase
                .from('pipelines')
                .select('id')
                .eq('produto', formData.produto)
                .eq('ativo', true)
                .single()
            return data
        }
    })

    // NOTE: No required fields are enforced at card creation time.
    // Governance rules (required fields per stage) apply only AFTER creation.


    // Title and stage are required for card creation
    const canSubmit = formData.titulo.trim().length > 0 && !!effectiveStageId && !!pipeline

    const { toast } = useToast()

    const createCardMutation = useMutation({
        mutationFn: async () => {
            if (!pipeline || !effectiveStageId) throw new Error('Pipeline or stage not selected')

            // Determine current owner based on role hierarchy: SDR > Planner > Pós > logged user
            const currentOwnerId = formData.sdr_owner_id
                ?? formData.vendas_owner_id
                ?? formData.pos_owner_id
                ?? profile?.id

            // Create the card with governance data in briefing_inicial
            const { data: card, error } = await supabase
                .from('cards')
                .insert({
                    titulo: formData.titulo,
                    produto: formData.produto,
                    pessoa_principal_id: formData.pessoa_principal_id,
                    pipeline_id: pipeline.id,
                    pipeline_stage_id: effectiveStageId,
                    sdr_owner_id: formData.sdr_owner_id,
                    vendas_owner_id: formData.vendas_owner_id,
                    pos_owner_id: formData.pos_owner_id,
                    dono_atual_id: currentOwnerId,
                    origem: formData.origem,
                    origem_lead: formData.origem_lead,
                    status_comercial: 'em_andamento',
                    moeda: 'BRL',
                    briefing_inicial: dynamicFields
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any)
                .select()
                .single()

            if (error) throw error
            return card
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })
            toast({
                title: "Card criado com sucesso!",
                type: "success"
            })
            onClose()
            // Reset form with auto-fill based on user's role
            setFormData({
                titulo: '',
                produto: 'TRIPS',
                pessoa_principal_id: null,
                pessoa_principal_nome: null,
                ...initialOwners,
                selectedStageId: null,
                origem: 'manual',
                origem_lead: null
            })
            setIndicacaoSearch('')
        },
        onError: (error) => {
            console.error('Erro ao criar card:', error)
            toast({
                title: "Erro ao criar card",
                description: error.message || "Ocorreu um erro inesperado.",
                type: "error"
            })
        }
    })

    const handleSave = () => {
        if (!canSubmit) return
        createCardMutation.mutate()
    }

    const handleClose = () => {
        if (createCardMutation.isPending) return
        onClose()
    }


    return (
        <>
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent ref={contentRef} className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-900">
                            Novo Card
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Section: Basic Info */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                Informações Básicas
                            </h3>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Título <span className="text-red-500">*</span>
                                </label>
                                <Input
                                    type="text"
                                    value={formData.titulo}
                                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                                    placeholder="Ex: Viagem Europa 2024"
                                    autoFocus
                                />
                            </div>

                            {/* Contact */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Contato Principal
                                </label>

                                {formData.pessoa_principal_id ? (
                                    <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                                <User className="h-4 w-4 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-900">{formData.pessoa_principal_nome}</p>
                                                <p className="text-xs text-slate-500">Selecionado</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, pessoa_principal_id: null, pessoa_principal_nome: null })}
                                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setShowContactSelector(true)}
                                        className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Selecionar Contato
                                    </button>
                                )}
                            </div>

                            {/* Product */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Produto
                                </label>
                                <select
                                    value={formData.produto}
                                    onChange={(e) => setFormData({ ...formData, produto: e.target.value as Product })}
                                    className="w-full h-11 px-4 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="TRIPS">Trips</option>
                                    <option value="WEDDING">Wedding</option>
                                    <option value="CORP">Corp</option>
                                </select>
                            </div>
                        </section>

                        {/* Section: Lead Origin */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                Origem do Lead
                            </h3>

                            <div className="flex flex-wrap gap-2">
                                {ORIGEM_OPTIONS.map(option => {
                                    const isSelected = formData.origem === option.value
                                    const IconMap: Record<string, React.ElementType> = {
                                        Megaphone, Users, Wallet, PenTool, MoreHorizontal
                                    }
                                    const Icon = IconMap[option.icon]
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                setFormData({ ...formData, origem: option.value, origem_lead: null })
                                                setIndicacaoSearch('')
                                                setShowIndicacaoResults(false)
                                            }}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200',
                                                'hover:shadow-sm active:scale-[0.98]',
                                                isSelected
                                                    ? `${option.color} ring-2 ring-offset-1 ring-indigo-500`
                                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                            )}
                                        >
                                            {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                                            {Icon && <Icon className="h-3.5 w-3.5" />}
                                            <span className="text-sm font-medium">{option.label}</span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Sub-field: Quem indicou? (indicacao) */}
                            {needsOrigemDetalhe(formData.origem) === 'indicacao' && (
                                <div className="relative">
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        Quem indicou?
                                    </label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            value={indicacaoSearch || formData.origem_lead || ''}
                                            onChange={(e) => {
                                                setIndicacaoSearch(e.target.value)
                                                setFormData({ ...formData, origem_lead: e.target.value })
                                                setShowIndicacaoResults(true)
                                            }}
                                            onFocus={() => setShowIndicacaoResults(true)}
                                            onBlur={() => setTimeout(() => setShowIndicacaoResults(false), 200)}
                                            placeholder="Digite o nome ou busque um contato..."
                                            className="pl-10"
                                        />
                                    </div>
                                    {showIndicacaoResults && indicacaoContacts && indicacaoContacts.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {indicacaoContacts.map(c => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault()
                                                        setFormData({ ...formData, origem_lead: c.nome })
                                                        setIndicacaoSearch(c.nome || '')
                                                        setShowIndicacaoResults(false)
                                                    }}
                                                >
                                                    <div className="h-7 w-7 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xs font-medium">
                                                        {(c.nome || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-slate-900 truncate">{c.nome}</p>
                                                        <p className="text-xs text-slate-500 truncate">{c.telefone || c.email || ''}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sub-field: Campanha / Fonte (mkt) */}
                            {needsOrigemDetalhe(formData.origem) === 'mkt' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        Campanha / Fonte
                                    </label>
                                    <Input
                                        value={formData.origem_lead || ''}
                                        onChange={(e) => setFormData({ ...formData, origem_lead: e.target.value })}
                                        placeholder="Ex: Google Ads, Instagram Stories..."
                                    />
                                </div>
                            )}
                        </section>

                        {/* Section: Assignment */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                Atribuição
                            </h3>

                            {/* SDR Responsável */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    SDR Responsável
                                </label>
                                <OwnerSelector
                                    value={formData.sdr_owner_id}
                                    onChange={(id, nome) => setFormData({
                                        ...formData,
                                        sdr_owner_id: id,
                                        sdr_owner_nome: nome
                                    })}
                                    product={formData.produto}
                                    showNoSdrOption={true}
                                    phaseSlug="sdr"
                                />
                            </div>

                            {/* Planner Responsável */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Planner Responsável
                                </label>
                                <OwnerSelector
                                    value={formData.vendas_owner_id}
                                    onChange={(id, nome) => setFormData({
                                        ...formData,
                                        vendas_owner_id: id,
                                        vendas_owner_nome: nome
                                    })}
                                    product={formData.produto}
                                    showNoSdrOption={true}
                                    placeholder="Selecionar Planner"
                                    phaseSlug="planner"
                                />
                            </div>

                            {/* Pós Responsável */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Pós-venda Responsável
                                </label>
                                <OwnerSelector
                                    value={formData.pos_owner_id}
                                    onChange={(id, nome) => setFormData({
                                        ...formData,
                                        pos_owner_id: id,
                                        pos_owner_nome: nome
                                    })}
                                    product={formData.produto}
                                    showNoSdrOption={true}
                                    placeholder="Selecionar Pós-venda"
                                    phaseSlug="pos_venda"
                                />
                            </div>
                        </section>

                        {/* Section: Stage Selection */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Etapa Inicial
                            </h3>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Criar card em <span className="text-red-500">*</span>
                                </label>
                                {loadingStages ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                        <span className="ml-2 text-sm text-slate-500">Carregando etapas...</span>
                                    </div>
                                ) : allowedStages.length === 0 ? (
                                    <div className="text-center py-3 px-4 text-sm text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
                                        Nenhuma etapa disponível para seu time.
                                    </div>
                                ) : (
                                    <QuickStageSelector
                                        stages={allowedStages}
                                        selectedStageId={effectiveStageId}
                                        onSelect={(id) => setFormData({ ...formData, selectedStageId: id })}
                                        showMore={showMoreStages}
                                        onToggleMore={() => setShowMoreStages(!showMoreStages)}
                                    />
                                )}

                                {isAdmin && (
                                    <p className="mt-1.5 text-xs text-slate-500">
                                        Você tem acesso a todas as etapas (admin).
                                    </p>
                                )}
                            </div>
                        </section>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={handleClose} disabled={createCardMutation.isPending}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!canSubmit || createCardMutation.isPending}
                            className={cn(
                                "bg-indigo-600 hover:bg-indigo-700 text-white",
                                (!canSubmit) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {createCardMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Criando...
                                </>
                            ) : (
                                'Criar Card'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {showContactSelector && (
                <ContactSelector
                    cardId=""
                    onClose={() => setShowContactSelector(false)}
                    onContactAdded={(contactId, contact) => {
                        if (contactId && contact) {
                            setFormData({
                                ...formData,
                                pessoa_principal_id: contactId,
                                pessoa_principal_nome: contact.nome
                            })
                            setShowContactSelector(false)
                        } else if (contactId) {
                            supabase.from('contatos').select('nome').eq('id', contactId).single().then(({ data }) => {
                                if (data) {
                                    setFormData({
                                        ...formData,
                                        pessoa_principal_id: contactId,
                                        pessoa_principal_nome: data.nome
                                    })
                                    setShowContactSelector(false)
                                }
                            })
                        }
                    }}
                />
            )}
        </>
    )
}
