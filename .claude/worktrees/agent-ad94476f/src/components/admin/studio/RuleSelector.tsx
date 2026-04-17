import { useState } from "react"
import { ChevronsUpDown, Search, FileText, CheckCircle2, LayoutList, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/Button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface RuleSelectorProps {
    onSelect: (type: 'field' | 'task' | 'proposal' | 'rule', value: string) => void
    systemFields: any[]
    taskTypes: any[]
    sections: any[]
    specialRules?: { key: string, label: string, icon: any }[]
}

export function RuleSelector({ onSelect, systemFields, taskTypes, sections, specialRules = [] }: RuleSelectorProps) {
    const [open, setOpen] = useState(false)

    // Group fields by section
    const fieldsBySection = sections.reduce((acc, section) => {
        const sectionFields = systemFields.filter(f => f.section === section.key)
        if (sectionFields.length > 0) {
            acc[section.key] = {
                label: section.label,
                fields: sectionFields
            }
        }
        return acc
    }, {} as Record<string, { label: string, fields: any[] }>)

    // Fields without section or with unknown section
    const otherFields = systemFields.filter(f => !f.section || !sections.find(s => s.key === f.section))
    if (otherFields.length > 0) {
        fieldsBySection['other'] = {
            label: 'Outros Campos',
            fields: otherFields
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="default"
                    size="sm"
                    role="combobox"
                    aria-expanded={open}
                    className="h-9 text-xs font-medium bg-gray-900 text-white border-0 hover:bg-gray-800 transition-colors justify-between min-w-[180px]"
                >
                    <span className="flex items-center gap-2">
                        <Search className="w-3 h-3 text-gray-400" />
                        Adicionar Regra...
                    </span>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 z-[9999] pointer-events-auto" align="end">
                <Command>
                    <CommandInput placeholder="Buscar regra, campo ou tarefa..." />
                    <CommandList>
                        <CommandEmpty>Nenhuma regra encontrada.</CommandEmpty>

                        {/* SPECIAL RULES */}
                        {specialRules.length > 0 && (
                            <CommandGroup heading="Regras Especiais">
                                {specialRules.map((rule) => (
                                    <CommandItem
                                        key={rule.key}
                                        value={`rule-${rule.key}`}
                                        onSelect={() => {
                                            onSelect('rule', rule.key)
                                            setOpen(false)
                                        }}
                                        className="cursor-pointer !pointer-events-auto !opacity-100"
                                    >
                                        <ShieldAlert className="mr-2 h-4 w-4 text-amber-500" />
                                        <span>{rule.label}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {specialRules.length > 0 && <CommandSeparator />}

                        {/* PROPOSALS */}
                        <CommandGroup heading="Propostas">
                            <CommandItem
                                value="proposal-sent"
                                onSelect={() => {
                                    onSelect('proposal', 'sent')
                                    setOpen(false)
                                }}
                                className="cursor-pointer !pointer-events-auto !opacity-100"
                            >
                                <FileText className="mr-2 h-4 w-4 text-emerald-500" />
                                <span>Exigir Proposta Enviada</span>
                            </CommandItem>
                            <CommandItem
                                value="proposal-viewed"
                                onSelect={() => {
                                    onSelect('proposal', 'viewed')
                                    setOpen(false)
                                }}
                                className="cursor-pointer !pointer-events-auto !opacity-100"
                            >
                                <FileText className="mr-2 h-4 w-4 text-emerald-500" />
                                <span>Exigir Proposta Visualizada</span>
                            </CommandItem>
                            <CommandItem
                                value="proposal-accepted"
                                onSelect={() => {
                                    onSelect('proposal', 'accepted')
                                    setOpen(false)
                                }}
                                className="cursor-pointer !pointer-events-auto !opacity-100"
                            >
                                <FileText className="mr-2 h-4 w-4 text-emerald-500" />
                                <span>Exigir Proposta Aceita</span>
                            </CommandItem>
                        </CommandGroup>

                        <CommandSeparator />

                        {/* TASKS */}
                        <CommandGroup heading="Tarefas Obrigatórias">
                            {taskTypes.map((t) => (
                                <CommandItem
                                    key={t.tipo}
                                    value={`task-${t.tipo}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')}
                                    onSelect={() => {
                                        onSelect('task', t.tipo)
                                        setOpen(false)
                                    }}
                                    className="cursor-pointer !pointer-events-auto !opacity-100"
                                >
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-purple-500" />
                                    <span>Exigir {t.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <CommandSeparator />

                        {/* FIELDS BY SECTION */}
                        {Object.entries(fieldsBySection).map(([key, section]: [string, any]) => (
                            <CommandGroup key={key} heading={section.label}>
                                {section.fields.map((field: any) => (
                                    <CommandItem
                                        key={field.key}
                                        value={`field-${field.key}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')}
                                        onSelect={() => {
                                            onSelect('field', field.key)
                                            setOpen(false)
                                        }}
                                        className="cursor-pointer !pointer-events-auto !opacity-100"
                                    >
                                        <LayoutList className="mr-2 h-4 w-4 text-blue-500" />
                                        <span>{field.label}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
