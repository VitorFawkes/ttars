/**
 * Toolbox — sidebar lateral com a lista de nodes disponíveis.
 *
 * Usuário arrasta um item daqui pro canvas. Drag-and-drop via dataTransfer
 * (padrão React Flow): o Canvas escuta `onDrop` e cria o node na posição.
 */
import React, { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { NODES_BY_CATEGORY, CATEGORY_LABEL } from '../nodes/registry'
import type { NodeCategory, NodeTypeMeta } from '../types'
import { EchoBadge } from '@/components/automations/EchoBadge'

const CATEGORY_ORDER: NodeCategory[] = [
    'trigger', 'echo', 'message', 'card', 'flow', 'integration',
]

const resolveIcon = (name: string): LucideIcon => {
    const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name]
    return Icon || LucideIcons.Circle
}

interface ToolboxProps {
    /** Quando true, deixa só os tipos que NÃO são trigger (já existe um) */
    hasTrigger: boolean
}

export const Toolbox: React.FC<ToolboxProps> = ({ hasTrigger }) => {
    const [query, setQuery] = useState('')
    const [collapsed, setCollapsed] = useState<Record<NodeCategory, boolean>>({
        trigger: false, card: false, message: false, echo: false, flow: false, integration: true,
    })

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow-type', nodeType)
        event.dataTransfer.effectAllowed = 'move'
    }

    const matchesQuery = (item: NodeTypeMeta) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    }

    return (
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-full">
            <div className="p-3 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">Adicionar passo</h2>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="pl-8 h-8 text-sm"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {CATEGORY_ORDER.map((cat) => {
                    const items = NODES_BY_CATEGORY[cat].filter(matchesQuery)
                    if (items.length === 0) return null
                    const isCollapsed = collapsed[cat]
                    return (
                        <div key={cat} className="mb-1">
                            <button
                                onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                                className="w-full flex items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wide font-medium text-slate-500 hover:bg-slate-50"
                            >
                                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                <span className="flex items-center gap-1">
                                    {cat === 'echo' && <EchoBadge iconOnly size={11} />}
                                    {CATEGORY_LABEL[cat]}
                                </span>
                                <span className="ml-auto text-slate-400">{items.length}</span>
                            </button>
                            {!isCollapsed && (
                                <div className="space-y-0.5 px-1">
                                    {items.map((item) => {
                                        const Icon = resolveIcon(item.iconName)
                                        const disabled = item.isTrigger && hasTrigger
                                        return (
                                            <div
                                                key={item.type}
                                                draggable={!disabled}
                                                onDragStart={(e) => !disabled && onDragStart(e, item.type)}
                                                className={`flex items-start gap-2 px-2 py-1.5 rounded-md text-sm ${
                                                    disabled
                                                        ? 'opacity-40 cursor-not-allowed'
                                                        : 'cursor-grab hover:bg-slate-50 active:cursor-grabbing'
                                                }`}
                                                title={disabled ? 'Workflow já tem um gatilho' : item.description}
                                            >
                                                <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center bg-slate-100 mt-0.5">
                                                    {item.category === 'echo'
                                                        ? <EchoBadge iconOnly size={12} />
                                                        : item.imageUrl
                                                            ? <img src={item.imageUrl} alt="" className="w-4 h-4 object-contain" />
                                                            : <Icon className="w-3.5 h-3.5 text-slate-700" />
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-slate-900 truncate">{item.label}</div>
                                                    <div className="text-[11px] text-slate-500 line-clamp-2">{item.description}</div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="p-3 border-t border-slate-200 text-[11px] text-slate-500">
                Arraste um passo pro canvas. Conecte os pontos pra montar o fluxo.
            </div>
        </aside>
    )
}

export default Toolbox
