import { useState } from 'react'
import { useProposalTemplates, useDeleteTemplate, type ProposalTemplate } from '@/hooks/useProposalTemplates'
import { seedTemplates } from '@/utils/seedTemplates'
import { Button } from '@/components/ui/Button'
import { TemplatePreviewModal } from '@/components/proposals/TemplatePreviewModal'
import { useQueryClient } from '@tanstack/react-query'
import {
    Plus,
    RotateCcw,
    MoreVertical,
    Trash2,
    Copy,
    Loader2,
    Layout,
    Heart,
    Sparkles,
    Map,
    FileText,
    Palmtree,
    Plane,
    Building2,
    Eye,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Icon mapping for templates
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    'heart': Heart,
    'sparkles': Sparkles,
    'map': Map,
    'file-text': FileText,
    'palmtree': Palmtree,
    'plane': Plane,
    'building2': Building2,
}

export function TemplateManager() {
    const { data: templates = [], isLoading } = useProposalTemplates()
    const deleteTemplate = useDeleteTemplate()
    const queryClient = useQueryClient()
    const [isSeeding, setIsSeeding] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<ProposalTemplate | null>(null)

    const handleSeedTemplates = async () => {
        setIsSeeding(true)
        try {
            await seedTemplates()
            queryClient.invalidateQueries({ queryKey: ['proposal-templates'] })
        } finally {
            setIsSeeding(false)
        }
    }

    const handleDelete = async (template: ProposalTemplate) => {
        if (template.is_global) {
            toast.error('Templates globais não podem ser excluídos')
            return
        }
        if (!confirm(`Tem certeza que deseja excluir o template "${template.name}"?`)) return
        try {
            await deleteTemplate.mutateAsync(template.id)
        } catch (error) {
            console.error('Error deleting template:', error)
        }
    }

    const handleDuplicate = async (_template: ProposalTemplate) => {
        toast.info('Funcionalidade em desenvolvimento', {
            description: 'Em breve você poderá duplicar templates.'
        })
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900">Templates de Proposta</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Modelos prontos para criar propostas rapidamente.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleSeedTemplates}
                        disabled={isSeeding}
                    >
                        {isSeeding ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        Restaurar Padrões
                    </Button>
                    <Button disabled>
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Template
                    </Button>
                </div>
            </div>

            {/* Empty State */}
            {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <Layout className="h-8 w-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-2">
                        Nenhum template encontrado
                    </h3>
                    <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                        Templates ajudam a criar propostas rapidamente. Clique em "Restaurar Padrões" para adicionar modelos de exemplo.
                    </p>
                    <Button onClick={handleSeedTemplates} disabled={isSeeding}>
                        {isSeeding ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        Restaurar Padrões
                    </Button>
                </div>
            ) : (
                /* Templates Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => {
                        const IconComponent = ICON_MAP[template.icon] || FileText
                        const sectionCount = Array.isArray(template.sections) ? template.sections.length : 0

                        return (
                            <div
                                key={template.id}
                                onClick={() => setSelectedTemplate(template)}
                                className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all overflow-hidden cursor-pointer"
                            >
                                {/* Global Badge */}
                                {template.is_global && (
                                    <div className="absolute top-3 left-3 z-10">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                            Padrão
                                        </span>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="absolute top-3 right-3 z-10">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                onClick={(e) => e.stopPropagation()}
                                                className="p-1.5 rounded-lg bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all shadow-sm"
                                            >
                                                <MoreVertical className="h-4 w-4 text-slate-600" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedTemplate(template)
                                            }}>
                                                <Eye className="h-4 w-4 mr-2" />
                                                Ver Detalhes
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation()
                                                handleDuplicate(template)
                                            }}>
                                                <Copy className="h-4 w-4 mr-2" />
                                                Duplicar
                                            </DropdownMenuItem>
                                            {!template.is_global && (
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDelete(template)
                                                    }}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Excluir
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {/* Content */}
                                <div className="p-5 pt-12">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                            "bg-gradient-to-br from-slate-100 to-slate-50"
                                        )}>
                                            <IconComponent className="h-6 w-6 text-slate-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-semibold text-slate-900 truncate">
                                                {template.name}
                                            </h3>
                                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                                                {template.description || 'Sem descrição'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Meta */}
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="px-2 py-0.5 rounded bg-slate-100">
                                                {sectionCount} seções
                                            </span>
                                            {template.usage_count > 0 && (
                                                <span>
                                                    Usado {template.usage_count}x
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Help Text */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-sm text-slate-600">
                    <strong>💡 Dica:</strong> Clique em um template para ver os detalhes. Para usar, abra um Card no Pipeline e clique em "Nova Proposta".
                </p>
            </div>

            {/* Preview Modal */}
            <TemplatePreviewModal
                template={selectedTemplate}
                onClose={() => setSelectedTemplate(null)}
            />
        </div>
    )
}
