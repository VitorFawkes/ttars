import { useState, useRef, useMemo, useCallback } from 'react'
import { useCommandPalette } from './hooks/useCommandPalette'
import { cn } from '@/lib/utils'
import {
    Search,
    Building2,
    Plane,
    Bus,
    Star,
    Shield,
    Ship,
    Car,
    Type,
    FileText,
    Image as ImageIcon,
    Video,
    Minus,
    FolderPlus,
    Send,
    Eye,
    Save,
} from 'lucide-react'
import type { ProposalSectionType } from '@/types/proposals'

interface Command {
    id: string
    label: string
    category: string
    icon: React.ElementType
    sectionType?: ProposalSectionType
    blockType?: string
    action?: string
}

const COMMANDS: Command[] = [
    // Travel
    { id: 'hotel', label: 'Adicionar Hotel', category: 'Viagem', icon: Building2, sectionType: 'hotels', blockType: 'hotel' },
    { id: 'flight', label: 'Adicionar Voo', category: 'Viagem', icon: Plane, sectionType: 'flights', blockType: 'flight' },
    { id: 'cruise', label: 'Adicionar Cruzeiro', category: 'Viagem', icon: Ship, sectionType: 'custom', blockType: 'cruise' },
    { id: 'car', label: 'Adicionar Carro', category: 'Viagem', icon: Car, sectionType: 'transfers', blockType: 'car' },
    { id: 'transfer', label: 'Adicionar Transfer', category: 'Extras', icon: Bus, sectionType: 'transfers', blockType: 'transfer' },
    { id: 'experience', label: 'Adicionar Experiencia', category: 'Extras', icon: Star, sectionType: 'custom', blockType: 'experience' },
    { id: 'insurance', label: 'Adicionar Seguro', category: 'Extras', icon: Shield, sectionType: 'custom', blockType: 'insurance' },
    { id: 'custom', label: 'Adicionar Secao Livre', category: 'Extras', icon: FolderPlus, sectionType: 'custom', blockType: 'custom' },
    // Content
    { id: 'title', label: 'Adicionar Titulo', category: 'Conteudo', icon: Type, sectionType: 'custom', blockType: 'title' },
    { id: 'text', label: 'Adicionar Texto', category: 'Conteudo', icon: FileText, sectionType: 'custom', blockType: 'text' },
    { id: 'image', label: 'Adicionar Imagem', category: 'Conteudo', icon: ImageIcon, sectionType: 'custom', blockType: 'image' },
    { id: 'video', label: 'Adicionar Video', category: 'Conteudo', icon: Video, sectionType: 'custom', blockType: 'video' },
    { id: 'divider', label: 'Adicionar Divisor', category: 'Conteudo', icon: Minus, sectionType: 'custom', blockType: 'divider' },
    // Actions
    { id: 'save', label: 'Salvar Rascunho', category: 'Acoes', icon: Save, action: 'save' },
    { id: 'publish', label: 'Enviar Proposta', category: 'Acoes', icon: Send, action: 'publish' },
    { id: 'preview', label: 'Preview Desktop', category: 'Acoes', icon: Eye, action: 'preview' },
]

interface CommandPaletteProps {
    onAddBlock: (sectionType: ProposalSectionType, label: string, blockType: string) => void
}

export function CommandPalette({ onAddBlock }: CommandPaletteProps) {
    const { isOpen } = useCommandPalette()
    // Render nothing if closed — component unmounts/remounts to reset state
    if (!isOpen) return null

    return <CommandPaletteInner onAddBlock={onAddBlock} />
}

function CommandPaletteInner({ onAddBlock }: CommandPaletteProps) {
    const { close } = useCommandPalette()
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const didFocusRef = useRef(false)

    // Auto-focus on mount via callback ref pattern
    const setInputRef = useCallback((node: HTMLInputElement | null) => {
        inputRef.current = node
        if (node && !didFocusRef.current) {
            didFocusRef.current = true
            setTimeout(() => node.focus(), 50)
        }
    }, [])

    // Filter commands
    const filtered = useMemo(() => {
        if (!query.trim()) return COMMANDS
        const q = query.toLowerCase()
        return COMMANDS.filter(c =>
            c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
        )
    }, [query])

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex((i) => Math.max(i - 1, 0))
        } else if (e.key === 'Enter' && filtered[selectedIndex]) {
            e.preventDefault()
            executeCommand(filtered[selectedIndex])
        } else if (e.key === 'Escape') {
            close()
        }
    }

    const executeCommand = (cmd: Command) => {
        close()
        if (cmd.sectionType && cmd.blockType) {
            onAddBlock(cmd.sectionType, cmd.label.replace('Adicionar ', ''), cmd.blockType)
        }
        // Actions could be handled here too
    }

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50" onClick={close} />

            {/* Palette */}
            <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl z-50 overflow-hidden">
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                    <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <input
                        ref={setInputRef}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar acoes..."
                        className="flex-1 text-sm text-slate-900 bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-400"
                    />
                    <kbd className="px-1.5 py-0.5 bg-slate-100 text-slate-400 text-[10px] rounded font-mono">ESC</kbd>
                </div>

                {/* Results */}
                <div className="max-h-[320px] overflow-y-auto py-2">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-slate-400">
                            Nenhum resultado para "{query}"
                        </div>
                    ) : (
                        filtered.map((cmd, i) => {
                            const Icon = cmd.icon
                            return (
                                <button
                                    key={cmd.id}
                                    onClick={() => executeCommand(cmd)}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                                        i === selectedIndex ? 'bg-indigo-50' : 'hover:bg-slate-50',
                                    )}
                                >
                                    <Icon className={cn('h-4 w-4 flex-shrink-0', i === selectedIndex ? 'text-indigo-600' : 'text-slate-400')} />
                                    <div className="flex-1 min-w-0">
                                        <span className={cn('text-sm', i === selectedIndex ? 'text-indigo-900 font-medium' : 'text-slate-700')}>
                                            {cmd.label}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">{cmd.category}</span>
                                </button>
                            )
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
                    <span><kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono mr-0.5">{"↑↓"}</kbd> navegar</span>
                    <span><kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono mr-0.5">{"↵"}</kbd> selecionar</span>
                    <span><kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono mr-0.5">esc</kbd> fechar</span>
                </div>
            </div>
        </>
    )
}
