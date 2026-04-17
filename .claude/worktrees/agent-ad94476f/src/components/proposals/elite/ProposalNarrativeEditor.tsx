import { useState } from 'react'
import { Bold, Italic, Underline, Link2, List, ListOrdered, Image, Undo, Redo } from 'lucide-react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { cn } from '@/lib/utils'

interface ProposalNarrativeEditorProps {
    isPreview?: boolean
}

/**
 * Narrative Editor - Rich text section for proposal storytelling
 * 
 * For now, uses a styled textarea. Can be upgraded to TipTap later.
 */
export function ProposalNarrativeEditor({ isPreview = false }: ProposalNarrativeEditorProps) {
    const { version, updateNarrative } = useProposalBuilder()
    const [isFocused, setIsFocused] = useState(false)

    // Read from metadata (narrative is stored in metadata JSONB)
    const metadata = (version?.metadata as Record<string, unknown>) || {}
    const narrative = (metadata.narrative as string) || ''

    // Toolbar buttons (for future TipTap integration)
    const toolbarButtons = [
        { icon: Bold, label: 'Negrito', action: () => { } },
        { icon: Italic, label: 'Itálico', action: () => { } },
        { icon: Underline, label: 'Sublinhado', action: () => { } },
        { divider: true },
        { icon: Link2, label: 'Link', action: () => { } },
        { icon: Image, label: 'Imagem', action: () => { } },
        { divider: true },
        { icon: List, label: 'Lista', action: () => { } },
        { icon: ListOrdered, label: 'Lista Numerada', action: () => { } },
    ]

    if (isPreview) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Narrativa</h3>
                <div className="prose prose-slate max-w-none">
                    {narrative ? (
                        <p className="whitespace-pre-wrap">{narrative}</p>
                    ) : (
                        <p className="text-slate-400 italic">Nenhuma narrativa adicionada</p>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className={cn(
            'bg-white rounded-xl border transition-all duration-200 shadow-sm',
            isFocused ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
        )}>
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 p-2 border-b border-slate-100">
                {toolbarButtons.map((btn, idx) => {
                    if ('divider' in btn) {
                        return (
                            <div key={idx} className="w-px h-5 bg-slate-200 mx-1" />
                        )
                    }

                    const Icon = btn.icon
                    return (
                        <button
                            key={idx}
                            onClick={btn.action}
                            title={btn.label}
                            className="p-2 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
                        >
                            <Icon className="h-4 w-4" />
                        </button>
                    )
                })}

                <div className="flex-1" />

                {/* Undo/Redo */}
                <button className="p-2 rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
                    <Undo className="h-4 w-4" />
                </button>
                <button className="p-2 rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
                    <Redo className="h-4 w-4" />
                </button>
            </div>

            {/* Editor Area */}
            <div className="relative">
                {/* Decorative image placeholder (like Traviata) */}
                <div className="absolute left-4 top-4 w-32 h-24 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center">
                    <Image className="h-6 w-6 text-slate-300" />
                </div>

                {/* Textarea with padding for image */}
                <textarea
                    value={narrative}
                    onChange={(e) => updateNarrative(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="Descreva a experiência que você está criando para o cliente. Conte a história da viagem, destaque os momentos especiais e transmita a emoção dessa jornada..."
                    className={cn(
                        'w-full min-h-[200px] p-4 pl-40 text-sm text-slate-700 leading-relaxed',
                        'bg-transparent border-none outline-none resize-none',
                        'placeholder:text-slate-300'
                    )}
                />
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    💡 Dica: Use uma narrativa envolvente para criar conexão emocional
                </p>
            </div>
        </div>
    )
}
