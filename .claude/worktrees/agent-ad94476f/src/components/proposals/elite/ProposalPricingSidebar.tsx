import { useMemo } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { Button } from '@/components/ui/Button'
import {
    Plane,
    Hotel,
    Sparkles,
    Car,
    Receipt,
    TrendingUp,
    Send,
    Save,
    Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Proposal } from '@/types/proposals'

interface ProposalPricingSidebarProps {
    proposal: Proposal
    isPreview?: boolean
}

interface PricingCategory {
    id: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    color: string
    total: number
}

/**
 * Pricing Sidebar - Real-time cost summary like Traviata
 * 
 * Features:
 * - Category breakdown (Flights, Hotels, Experiences, Transfers)
 * - Real-time totals
 * - Save & Send actions
 * - Visual progress indicators
 */
export function ProposalPricingSidebar({ proposal, isPreview = false }: ProposalPricingSidebarProps) {
    const { sections, save, publish, isDirty, isSaving } = useProposalBuilder()

    // Calculate pricing by category (using item metadata)
    const pricing = useMemo<PricingCategory[]>(() => {
        const categories: PricingCategory[] = [
            { id: 'flights', label: 'Voos', icon: Plane, color: 'blue', total: 0 },
            { id: 'hotels', label: 'Hospedagem', icon: Hotel, color: 'emerald', total: 0 },
            { id: 'experiences', label: 'Experiências', icon: Sparkles, color: 'amber', total: 0 },
            { id: 'transfers', label: 'Transfers', icon: Car, color: 'purple', total: 0 },
        ]

        // For now, sum all items - in future, categorize by item metadata
        let totalFromItems = 0
        sections.forEach(section => {
            (section.items || []).forEach(item => {
                // Try to get price from item rich_content
                const itemContent = (item.rich_content as Record<string, unknown>) || {}
                const price = itemContent.price as number | undefined
                if (price) {
                    totalFromItems += price
                }
            })
        })

        // Distribute evenly for demo (in production, categorize properly)
        if (totalFromItems > 0) {
            categories[0].total = Math.round(totalFromItems * 0.3)
            categories[1].total = Math.round(totalFromItems * 0.4)
            categories[2].total = Math.round(totalFromItems * 0.2)
            categories[3].total = Math.round(totalFromItems * 0.1)
        }

        return categories
    }, [sections])

    // Total calculation
    const total = useMemo(() => {
        return pricing.reduce((sum, cat) => sum + cat.total, 0)
    }, [pricing])

    // Color mapping
    const colorClasses: Record<string, { bg: string; text: string }> = {
        blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
        emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
        amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
        purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-slate-400" />
                    Resumo da Proposta
                </h3>
            </div>

            {/* Pricing Categories */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {pricing.map((category) => {
                    const colors = colorClasses[category.color]
                    const Icon = category.icon

                    return (
                        <div
                            key={category.id}
                            className="flex items-center justify-between py-2"
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    'w-8 h-8 rounded-lg flex items-center justify-center',
                                    colors.bg
                                )}>
                                    <Icon className={cn('h-4 w-4', colors.text)} />
                                </div>
                                <span className="text-sm text-slate-600">{category.label}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-900">
                                {category.total > 0
                                    ? `R$ ${category.total.toLocaleString('pt-BR')}`
                                    : '-'
                                }
                            </span>
                        </div>
                    )
                })}

                {/* Divider */}
                <div className="border-t border-slate-200 my-4" />

                {/* Total */}
                <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-semibold text-slate-900">Total</span>
                    <span className="text-lg font-bold text-slate-900">
                        R$ {total.toLocaleString('pt-BR')}
                    </span>
                </div>

                {/* Estimated Total with markup */}
                <div className="flex items-center justify-between py-2 bg-slate-50 rounded-lg px-3 -mx-1">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-slate-600">Total Estimado:</span>
                    </div>
                    <span className="text-lg font-bold text-emerald-600">
                        R$ {total.toLocaleString('pt-BR')}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-200 space-y-3">
                {/* Save Button */}
                {!isPreview && (
                    <Button
                        variant="outline"
                        onClick={save}
                        disabled={!isDirty || isSaving}
                        className="w-full"
                    >
                        {isSaving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        {isSaving ? 'Salvando...' : 'Salvar Proposta'}
                    </Button>
                )}

                {/* Send Button */}
                <Button
                    onClick={publish}
                    disabled={proposal.status !== 'draft'}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                    <Send className="h-4 w-4 mr-2" />
                    Enviar para Cliente
                </Button>

                {/* Status hint */}
                {proposal.status !== 'draft' && (
                    <p className="text-xs text-center text-slate-500">
                        Esta proposta já foi enviada. Crie uma nova versão para editar.
                    </p>
                )}
            </div>
        </div>
    )
}
