import { useState, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Hash, X } from 'lucide-react'
import type { FilterState } from '../../../hooks/usePipelineFilters'

interface FilterSectionIdentifiersProps {
    filters: FilterState
    onUpdate: (partial: Partial<FilterState>) => void
}

export function FilterSectionIdentifiers({ filters, onUpdate }: FilterSectionIdentifiersProps) {
    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const values = filters.mondeVendaNums || []

    const commitValue = (raw: string) => {
        const tokens = raw
            .split(/[,\s]+/)
            .map(t => t.replace(/\D/g, ''))
            .filter(t => t.length > 0)
        if (tokens.length === 0) {
            setInput('')
            return
        }
        const dedup = Array.from(new Set([...values, ...tokens]))
        onUpdate({ mondeVendaNums: dedup.length ? dedup : undefined })
        setInput('')
    }

    const removeAt = (idx: number) => {
        const next = values.filter((_, i) => i !== idx)
        onUpdate({ mondeVendaNums: next.length ? next : undefined })
    }

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commitValue(input)
        } else if (e.key === 'Backspace' && input === '' && values.length > 0) {
            removeAt(values.length - 1)
        }
    }

    const handleChange = (raw: string) => {
        if (raw.includes(',')) {
            commitValue(raw)
            return
        }
        setInput(raw.replace(/[^\d\s]/g, ''))
    }

    const clearAll = () => {
        onUpdate({ mondeVendaNums: undefined })
        setInput('')
    }

    return (
        <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Hash className="h-3 w-3" /> Identificadores
                {values.length > 0 && (
                    <span className="ml-auto bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {values.length}
                    </span>
                )}
            </h3>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700 block">N° Venda Monde</label>
                    {values.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                        >
                            Limpar
                        </button>
                    )}
                </div>
                <div
                    className="flex flex-wrap items-center gap-1.5 min-h-[40px] px-2 py-1.5 border border-gray-200 rounded-lg focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all cursor-text"
                    onClick={() => inputRef.current?.focus()}
                >
                    {values.map((num, idx) => (
                        <span
                            key={`${num}-${idx}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-medium"
                        >
                            {num}
                            <button
                                onClick={(e) => { e.stopPropagation(); removeAt(idx) }}
                                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-indigo-200 transition-colors"
                                aria-label={`Remover ${num}`}
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </span>
                    ))}
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="numeric"
                        value={input}
                        onChange={(e) => handleChange(e.target.value)}
                        onKeyDown={handleKey}
                        onBlur={() => commitValue(input)}
                        placeholder={values.length === 0 ? 'Ex: 69144, 70866' : ''}
                        className="flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder:text-gray-400 py-0.5"
                    />
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                    Aperte Enter ou vírgula pra adicionar. Filtra cards que tenham qualquer um desses números.
                </p>
            </div>
        </div>
    )
}
