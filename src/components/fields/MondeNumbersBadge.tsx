import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Hash, ChevronDown } from 'lucide-react'
import { useCardMondeVendas } from '@/hooks/useCardMondeVendas'

interface MondeNumbersBadgeProps {
    cardId: string | undefined
    primaryNumber: string | null | undefined
}

export default function MondeNumbersBadge({ cardId, primaryNumber }: MondeNumbersBadgeProps) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    const { data: vendas = [] } = useCardMondeVendas(cardId)

    // Lista ordenada: primário primeiro (se existir), demais por número
    const ordered = (() => {
        if (!primaryNumber) return vendas
        const primary = vendas.find(v => v.numero === primaryNumber)
        const rest = vendas.filter(v => v.numero !== primaryNumber)
        return primary ? [primary, ...rest] : vendas
    })()

    const extraCount = Math.max(0, ordered.length - 1)
    const displayPrimary = primaryNumber || ordered[0]?.numero || null

    useEffect(() => {
        if (!open || !containerRef.current) return
        const updatePos = () => {
            const rect = containerRef.current!.getBoundingClientRect()
            setPos({ top: rect.bottom + 4, left: rect.left })
        }
        updatePos()
        window.addEventListener('resize', updatePos)
        window.addEventListener('scroll', updatePos, true)
        return () => {
            window.removeEventListener('resize', updatePos)
            window.removeEventListener('scroll', updatePos, true)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            const inContainer = containerRef.current?.contains(target)
            const inPopover = popoverRef.current?.contains(target)
            if (!inContainer && !inPopover) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    if (!displayPrimary) return <span className="text-sm text-slate-500">—</span>

    const popover = open && ordered.length > 0 && pos ? createPortal(
        <div
            ref={popoverRef}
            style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: 288,
                maxHeight: `min(360px, calc(100vh - ${pos.top + 16}px))`,
                zIndex: 60,
            }}
            className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 space-y-1.5 overflow-y-auto"
        >
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 sticky top-0 bg-white pt-1 pb-1">
                Todos os N de Venda Monde
            </p>
            {ordered.map((v) => (
                <div
                    key={v.numero}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Hash className="h-3 w-3 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-900 block truncate">
                                {v.numero}
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {v.qtd_produtos} {v.qtd_produtos === 1 ? 'produto' : 'produtos'}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>,
        document.body
    ) : null

    return (
        <div className="relative inline-flex items-center gap-1.5" ref={containerRef}>
            <span className="text-sm text-slate-900 font-medium">{displayPrimary}</span>

            {extraCount > 0 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        setOpen(!open)
                    }}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors"
                >
                    +{extraCount}
                    <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            )}

            {popover}
        </div>
    )
}
