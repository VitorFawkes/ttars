import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { SectionEditor } from './SectionEditor'
import { AddSectionMenu } from './AddSectionMenu'
import { FileText, Sparkles, Plane, Hotel, Calendar } from 'lucide-react'
import type { ProposalSectionType } from '@/types/proposals'

// Quick-start template configurations
const QUICK_START_TEMPLATES = [
    {
        id: 'roteiro',
        label: 'Roteiro Básico',
        description: 'Ideal para viagens simples',
        icon: Calendar,
        sections: [
            { type: 'cover' as ProposalSectionType, title: 'Capa' },
            { type: 'itinerary' as ProposalSectionType, title: 'Roteiro' },
            { type: 'summary' as ProposalSectionType, title: 'Resumo' },
        ],
    },
    {
        id: 'completo',
        label: 'Pacote Completo',
        description: 'Voos, hotéis e experiências',
        icon: Plane,
        sections: [
            { type: 'cover' as ProposalSectionType, title: 'Capa' },
            { type: 'flights' as ProposalSectionType, title: 'Voos' },
            { type: 'hotels' as ProposalSectionType, title: 'Hospedagem' },
            { type: 'experiences' as ProposalSectionType, title: 'Experiências' },
            { type: 'transfers' as ProposalSectionType, title: 'Transfers' },
            { type: 'summary' as ProposalSectionType, title: 'Resumo' },
        ],
    },
    {
        id: 'hotelaria',
        label: 'Só Hotelaria',
        description: 'Apenas hotéis e resorts',
        icon: Hotel,
        sections: [
            { type: 'cover' as ProposalSectionType, title: 'Capa' },
            { type: 'hotels' as ProposalSectionType, title: 'Opções de Hospedagem' },
            { type: 'summary' as ProposalSectionType, title: 'Resumo' },
        ],
    },
]

export function SectionList() {
    const { sections, addSection } = useProposalBuilder()

    const handleQuickStart = (template: typeof QUICK_START_TEMPLATES[0]) => {
        template.sections.forEach((section, index) => {
            // Small delay between each to ensure proper ordering
            setTimeout(() => {
                addSection(section.type, section.title)
            }, index * 50)
        })
    }

    if (sections.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                {/* Hero Empty State */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-6 shadow-sm">
                    <FileText className="h-10 w-10 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Vamos criar sua proposta?
                </h3>
                <p className="text-sm text-slate-500 mb-8 text-center max-w-md">
                    Escolha um template para começar rapidamente ou adicione seções manualmente.
                </p>

                {/* Quick Start Templates */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 w-full max-w-2xl">
                    {QUICK_START_TEMPLATES.map((template) => {
                        const Icon = template.icon
                        return (
                            <button
                                key={template.id}
                                onClick={() => handleQuickStart(template)}
                                className="group relative p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 text-left"
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                                        <Icon className="h-5 w-5 text-slate-600 group-hover:text-blue-600 transition-colors" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-900 text-sm">{template.label}</h4>
                                        <p className="text-xs text-slate-500">{template.description}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-3">
                                    {template.sections.map((s, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                            {s.title}
                                        </span>
                                    ))}
                                </div>
                                <Sparkles className="absolute top-3 right-3 h-4 w-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        )
                    })}
                </div>

                {/* Or Manual */}
                <div className="flex items-center gap-4 text-sm text-slate-400">
                    <div className="h-px w-12 bg-slate-200" />
                    <span>ou adicione manualmente</span>
                    <div className="h-px w-12 bg-slate-200" />
                </div>
                <div className="mt-4">
                    <AddSectionMenu />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {sections.map((section) => (
                <SectionEditor
                    key={section.id}
                    section={section}
                />
            ))}

            {/* Add Section Button at bottom */}
            <div className="flex justify-center pt-4">
                <AddSectionMenu />
            </div>
        </div>
    )
}
