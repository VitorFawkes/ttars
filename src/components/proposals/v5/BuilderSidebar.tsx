import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
    Building2,
    Plane,
    Ship,
    Car,
    Bus,
    Star,
    Shield,
    FolderPlus,
    Type,
    FileText,
    Image as ImageIcon,
    Video,
    Minus,
    PanelLeftClose,
    PanelLeft,
    Keyboard,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ProposalSectionType } from '@/types/proposals'

// Block definitions for quick-add
interface BlockDef {
    id: string
    label: string
    icon: React.ElementType
    sectionType: ProposalSectionType
    blockType: string
    color: string
}

const TRAVEL_BLOCKS: BlockDef[] = [
    { id: 'hotel', label: 'Hotel', icon: Building2, sectionType: 'hotels', blockType: 'hotel', color: 'text-blue-600 bg-blue-50' },
    { id: 'flight', label: 'Voo', icon: Plane, sectionType: 'flights', blockType: 'flight', color: 'text-sky-600 bg-sky-50' },
    { id: 'cruise', label: 'Cruzeiro', icon: Ship, sectionType: 'custom', blockType: 'cruise', color: 'text-indigo-600 bg-indigo-50' },
    { id: 'car', label: 'Carro', icon: Car, sectionType: 'transfers', blockType: 'car', color: 'text-emerald-600 bg-emerald-50' },
]

const EXTRAS_BLOCKS: BlockDef[] = [
    { id: 'transfer', label: 'Transfer', icon: Bus, sectionType: 'transfers', blockType: 'transfer', color: 'text-teal-600 bg-teal-50' },
    { id: 'experience', label: 'Experiencia', icon: Star, sectionType: 'custom', blockType: 'experience', color: 'text-orange-600 bg-orange-50' },
    { id: 'insurance', label: 'Seguro', icon: Shield, sectionType: 'custom', blockType: 'insurance', color: 'text-rose-600 bg-rose-50' },
    { id: 'custom', label: 'Outros', icon: FolderPlus, sectionType: 'custom', blockType: 'custom', color: 'text-amber-600 bg-amber-50' },
]

const CONTENT_BLOCKS: BlockDef[] = [
    { id: 'title', label: 'Titulo', icon: Type, sectionType: 'custom', blockType: 'title', color: 'text-slate-600 bg-slate-100' },
    { id: 'text', label: 'Texto', icon: FileText, sectionType: 'custom', blockType: 'text', color: 'text-slate-600 bg-slate-100' },
    { id: 'image', label: 'Imagem', icon: ImageIcon, sectionType: 'custom', blockType: 'image', color: 'text-pink-600 bg-pink-50' },
    { id: 'video', label: 'Video', icon: Video, sectionType: 'custom', blockType: 'video', color: 'text-purple-600 bg-purple-50' },
    { id: 'divider', label: 'Divisor', icon: Minus, sectionType: 'custom', blockType: 'divider', color: 'text-slate-400 bg-slate-100' },
]

interface BuilderSidebarProps {
    onAddBlock: (sectionType: ProposalSectionType, label: string, blockType: string) => void
    onOpenCommandPalette: () => void
}

function BlockButton({ block, collapsed, onClick }: { block: BlockDef; collapsed: boolean; onClick: () => void }) {
    const Icon = block.icon
    return (
        <button
            onClick={onClick}
            title={block.label}
            className={cn(
                'flex items-center gap-2.5 rounded-lg transition-all duration-150',
                'hover:shadow-sm active:scale-[0.97]',
                collapsed ? 'w-10 h-10 justify-center' : 'w-full px-3 py-2',
                'bg-white border border-slate-200 hover:border-slate-300',
            )}
        >
            <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', block.color)}>
                <Icon className="h-3.5 w-3.5" />
            </div>
            {!collapsed && <span className="text-xs font-medium text-slate-700">{block.label}</span>}
        </button>
    )
}

function BlockGroup({ title, blocks, collapsed, onAdd }: { title: string; blocks: BlockDef[]; collapsed: boolean; onAdd: (b: BlockDef) => void }) {
    return (
        <div className="space-y-1.5">
            {!collapsed && (
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">{title}</h3>
            )}
            <div className={cn(collapsed ? 'space-y-1' : 'space-y-1')}>
                {blocks.map((b) => (
                    <BlockButton key={b.id} block={b} collapsed={collapsed} onClick={() => onAdd(b)} />
                ))}
            </div>
        </div>
    )
}

export function BuilderSidebar({ onAddBlock, onOpenCommandPalette }: BuilderSidebarProps) {
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem('proposal-sidebar-collapsed') === 'true' } catch { return false }
    })

    const toggleCollapse = () => {
        const next = !collapsed
        setCollapsed(next)
        try { localStorage.setItem('proposal-sidebar-collapsed', String(next)) } catch { /* noop */ }
    }

    const handleAdd = (b: BlockDef) => onAddBlock(b.sectionType, b.label, b.blockType)

    return (
        <div className={cn(
            'flex-shrink-0 bg-slate-50/80 border-r border-slate-200 flex flex-col transition-all duration-200',
            collapsed ? 'w-[56px]' : 'w-[200px]',
        )}>
            {/* Toggle */}
            <div className={cn('flex items-center border-b border-slate-200 h-10', collapsed ? 'justify-center' : 'justify-between px-3')}>
                {!collapsed && <span className="text-xs font-semibold text-slate-700">Blocos</span>}
                <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-7 w-7">
                    {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </Button>
            </div>

            {/* Blocks */}
            <div className={cn('flex-1 overflow-y-auto', collapsed ? 'p-2' : 'p-3', 'space-y-4')}>
                <BlockGroup title="Viagem" blocks={TRAVEL_BLOCKS} collapsed={collapsed} onAdd={handleAdd} />
                <BlockGroup title="Extras" blocks={EXTRAS_BLOCKS} collapsed={collapsed} onAdd={handleAdd} />
                <BlockGroup title="Conteudo" blocks={CONTENT_BLOCKS} collapsed={collapsed} onAdd={handleAdd} />
            </div>

            {/* Footer — Keyboard shortcut hint */}
            <div className={cn('border-t border-slate-200', collapsed ? 'p-2' : 'p-3')}>
                <button
                    onClick={onOpenCommandPalette}
                    className={cn(
                        'flex items-center gap-2 rounded-lg text-slate-400 hover:text-slate-600 transition-colors',
                        collapsed ? 'w-10 h-10 justify-center' : 'w-full px-2 py-1.5',
                    )}
                    title="Busca rapida (⌘/)"
                >
                    <Keyboard className="h-3.5 w-3.5 flex-shrink-0" />
                    {!collapsed && <span className="text-[10px]">⌘/ Busca rapida</span>}
                </button>
            </div>
        </div>
    )
}
