import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import type { ProposalSectionType } from '@/types/proposals'
import { Button } from '@/components/ui/Button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus } from 'lucide-react'
import * as LucideIcons from 'lucide-react'

export function AddSectionMenu() {
    const { addSection } = useProposalBuilder()

    const sectionTypes = Object.entries(SECTION_TYPE_CONFIG) as [ProposalSectionType, typeof SECTION_TYPE_CONFIG[ProposalSectionType]][]

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Seção
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
                {sectionTypes.map(([type, config]) => {
                    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.FileText
                    return (
                        <DropdownMenuItem
                            key={type}
                            onClick={() => addSection(type)}
                            className="flex items-center gap-2"
                        >
                            <IconComponent className="h-4 w-4 text-slate-500" />
                            <span>{config.label}</span>
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
