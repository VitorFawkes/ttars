import { useState } from 'react'
import { useProposalTemplates } from '@/hooks/useProposalTemplates'
import type { ProposalTemplate, TemplateSection } from '@/hooks/useProposalTemplates'
import { Button } from '@/components/ui/Button'
import {
    FileText,
    Map,
    Package,
    Bed,
    Ship,
    Plus,
    Loader2,
    Check,
    Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { seedTemplates } from '@/utils/seedTemplates'
import { useQueryClient } from '@tanstack/react-query'
import { templateKeys } from '@/hooks/useProposalTemplates'

interface TemplateSelectorProps {
    onSelect: (template: ProposalTemplate | null) => void
    onCancel?: () => void
}

const ICON_MAP: Record<string, React.ReactNode> = {
    'file-text': <FileText className="h-5 w-5" />,
    'map': <Map className="h-5 w-5" />,
    'package': <Package className="h-5 w-5" />,
    'bed': <Bed className="h-5 w-5" />,
    'ship': <Ship className="h-5 w-5" />,
}

export function TemplateSelector({ onSelect, onCancel }: TemplateSelectorProps) {
    const { data: templates = [], isLoading } = useProposalTemplates()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [isSeeding, setIsSeeding] = useState(false)
    const queryClient = useQueryClient()

    const handleConfirm = () => {
        const selected = templates.find(t => t.id === selectedId)
        onSelect(selected || null)
    }

    const handleSeed = async () => {
        setIsSeeding(true)
        await seedTemplates()
        await queryClient.invalidateQueries({ queryKey: templateKeys.lists() })
        setIsSeeding(false)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 mb-4">
                    <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                    Escolha um Template
                </h2>
                <p className="text-sm text-slate-500">
                    Comece com uma estrutura pronta ou crie do zero
                </p>
            </div>

            {/* Template Grid */}
            <div className="grid grid-cols-2 gap-3">
                {/* Blank Option */}
                <button
                    onClick={() => setSelectedId(null)}
                    className={cn(
                        'text-left p-4 rounded-xl border-2 transition-all duration-200',
                        selectedId === null
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    )}
                >
                    <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                        selectedId === null ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
                    )}>
                        <Plus className="h-5 w-5" />
                    </div>
                    <h3 className="font-medium text-slate-900 text-sm mb-1">
                        Em Branco
                    </h3>
                    <p className="text-xs text-slate-500">
                        Comece do zero
                    </p>
                    {selectedId === null && (
                        <div className="absolute top-2 right-2">
                            <Check className="h-4 w-4 text-blue-600" />
                        </div>
                    )}
                </button>

                {/* Template Cards */}
                {templates.map((template) => (
                    <button
                        key={template.id}
                        onClick={() => setSelectedId(template.id)}
                        className={cn(
                            'relative text-left p-4 rounded-xl border-2 transition-all duration-200',
                            selectedId === template.id
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        )}
                    >
                        {selectedId === template.id && (
                            <div className="absolute top-2 right-2">
                                <Check className="h-4 w-4 text-blue-600" />
                            </div>
                        )}
                        <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                            selectedId === template.id
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-100 text-slate-500'
                        )}>
                            {ICON_MAP[template.icon] || <FileText className="h-5 w-5" />}
                        </div>
                        <h3 className="font-medium text-slate-900 text-sm mb-1">
                            {template.name}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-2">
                            {template.description || `${template.sections.length} seções`}
                        </p>
                        {template.is_global && (
                            <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                                Template Padrão
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
                {onCancel && (
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        className="flex-1"
                    >
                        Cancelar
                    </Button>
                )}
                <Button
                    onClick={handleConfirm}
                    className="flex-1"
                >
                    Continuar
                </Button>
            </div>

            {/* Seed Button (only if few templates) */}
            {templates.length < 5 && (
                <div className="text-center pt-2">
                    <button
                        onClick={handleSeed}
                        disabled={isSeeding}
                        className="text-xs text-slate-400 hover:text-blue-600 underline transition-colors"
                    >
                        {isSeeding ? 'Gerando...' : 'Restaurar Templates Padrão'}
                    </button>
                </div>
            )}
        </div>
    )
}

// ============================================
// Quick Template Cards (for empty state)
// ============================================

interface QuickTemplateCardsProps {
    onSelectTemplate: (sections: TemplateSection[]) => void
}

export function QuickTemplateCards({ onSelectTemplate }: QuickTemplateCardsProps) {
    const { data: templates = [], isLoading } = useProposalTemplates()

    if (isLoading || templates.length === 0) return null

    const topTemplates = templates.filter(t => t.is_global).slice(0, 3)

    return (
        <div className="grid grid-cols-3 gap-3">
            {topTemplates.map((template) => (
                <button
                    key={template.id}
                    onClick={() => onSelectTemplate(template.sections)}
                    className="p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200 text-left group"
                >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 text-slate-500 group-hover:text-blue-600 transition-colors">
                        {ICON_MAP[template.icon] || <FileText className="h-4 w-4" />}
                    </div>
                    <h4 className="font-medium text-slate-900 text-sm mb-1">
                        {template.name}
                    </h4>
                    <p className="text-xs text-slate-400">
                        {template.sections.length} seções
                    </p>
                </button>
            ))}
        </div>
    )
}
