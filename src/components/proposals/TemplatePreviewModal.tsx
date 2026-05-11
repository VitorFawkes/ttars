import { X, Eye, FileText, ChevronRight, Heart, Sparkles, Map, Palmtree, Plane, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ProposalTemplate } from '@/hooks/useProposalTemplates'

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    'heart': Heart,
    'sparkles': Sparkles,
    'map': Map,
    'file-text': FileText,
    'palmtree': Palmtree,
    'plane': Plane,
    'building2': Building2,
}

interface TemplateSection {
    id: string
    type: string
    title: string
    order: number
    items?: Array<{ id: string; title?: string; type: string; description?: string }>
}

interface TemplatePreviewModalProps {
    template: ProposalTemplate | null
    onClose: () => void
}

export function TemplatePreviewModal({ template, onClose }: TemplatePreviewModalProps) {
    if (!template) return null

    const sections = (template.sections as TemplateSection[]) || []
    const IconComponent = ICON_MAP[template.icon] || FileText

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                            <IconComponent className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">
                                {template.name}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {template.description || 'Template de proposta'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="h-5 w-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Eye className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">
                                Prévia das Seções ({sections.length})
                            </span>
                        </div>

                        <div className="space-y-3">
                            {sections.map((section, index) => (
                                <div
                                    key={section.id}
                                    className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-sm font-medium text-slate-600">
                                                {index + 1}
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-slate-900">
                                                    {section.title}
                                                </h4>
                                                <p className="text-xs text-slate-500 capitalize">
                                                    Tipo: {section.type.replace('_', ' ')}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                    </div>

                                    {/* Show items if they exist */}
                                    {section.items && section.items.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-slate-200">
                                            <p className="text-xs text-slate-500 mb-2">
                                                {section.items.length} item(ns) incluído(s):
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {section.items.slice(0, 3).map(item => (
                                                    <span
                                                        key={item.id}
                                                        className="text-xs px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600"
                                                    >
                                                        {item.title || item.type}
                                                    </span>
                                                ))}
                                                {section.items.length > 3 && (
                                                    <span className="text-xs text-slate-400">
                                                        +{section.items.length - 3} mais
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 pt-4 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Usado:</span>
                            <span className="text-xs font-medium text-slate-700">
                                {template.usage_count || 0} vezes
                            </span>
                        </div>
                        {template.is_global && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                Template Padrão
                            </span>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-500">
                            💡 Para usar, abra um Card e clique em "Nova Proposta"
                        </p>
                        <Button variant="outline" onClick={onClose}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
