import { useState } from 'react'
import { Tag, Check, Plus, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { TagBadge } from './TagBadge'
import { useCardTags, useCardTagAssignments } from '../../hooks/useCardTags'

interface TagSelectorProps {
    cardId: string
    produto?: string | null
    /** Se true, exibe apenas os badges sem o botão de editar */
    readOnly?: boolean
}

export function TagSelector({ cardId, produto, readOnly = false }: TagSelectorProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')

    const { tags: availableTags } = useCardTags(produto ?? undefined)
    const { tagIds, assign, unassign } = useCardTagAssignments(cardId)

    const selectedTags = availableTags.filter(t => tagIds.includes(t.id))
    const filteredTags = availableTags.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase())
    )

    const toggle = (tagId: string) => {
        if (tagIds.includes(tagId)) {
            unassign.mutate(tagId)
        } else {
            assign.mutate(tagId)
        }
    }

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {selectedTags.map(tag => (
                <TagBadge
                    key={tag.id}
                    tag={tag}
                    onRemove={readOnly ? undefined : () => unassign.mutate(tag.id)}
                />
            ))}

            {!readOnly && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 hover:border-slate-400 rounded-full px-2 py-0.5 transition-colors"
                        >
                            <Plus className="w-3 h-3" />
                            {selectedTags.length === 0 ? 'Tag' : ''}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className="w-56 p-0 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden"
                    >
                        <div className="p-2 border-b border-slate-100">
                            <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded-md">
                                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Buscar tag..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="text-xs bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-400"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="max-h-52 overflow-y-auto py-1">
                            {filteredTags.length === 0 ? (
                                <div className="flex flex-col items-center gap-1 py-4 text-slate-400">
                                    <Tag className="w-4 h-4" />
                                    <p className="text-xs">Nenhuma tag encontrada</p>
                                </div>
                            ) : (
                                filteredTags.map(tag => {
                                    const selected = tagIds.includes(tag.id)
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => toggle(tag.id)}
                                            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 transition-colors"
                                        >
                                            <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: tag.color }}
                                            />
                                            <span className="text-xs text-slate-700 flex-1 text-left">
                                                {tag.name}
                                            </span>
                                            {selected && (
                                                <Check
                                                    className="w-3.5 h-3.5 shrink-0"
                                                    style={{ color: tag.color }}
                                                />
                                            )}
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    )
}
