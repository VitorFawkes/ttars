import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import {
    ArrowLeft,
    Eye,
    MoreVertical,
    Check,
    Loader2,
    Monitor,
    Smartphone,
    ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProposalFull } from '@/types/proposals'

/**
 * BuilderHeader - Top header for the proposal builder
 * 
 * Shows:
 * - Back button
 * - Proposal title
 * - Save status indicator
 * - Preview button with Desktop/Mobile options
 */

interface BuilderHeaderProps {
    proposal: ProposalFull
    isDirty: boolean
    isSaving: boolean
}

type PreviewMode = 'desktop' | 'mobile'

export function BuilderHeader({ proposal, isDirty, isSaving }: BuilderHeaderProps) {
    const navigate = useNavigate()
    const [showPreviewMenu, setShowPreviewMenu] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowPreviewMenu(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handlePreview = (mode: PreviewMode) => {
        setShowPreviewMenu(false)
        if (!proposal.public_token) return

        const baseUrl = `/p/${proposal.public_token}`

        if (mode === 'desktop') {
            // Open in new tab
            window.open(baseUrl, '_blank')
        } else {
            // Open mobile preview in a sized popup with force mobile mode
            const url = `${baseUrl}?mode=mobile`
            const width = 390 // iPhone 14 Pro width
            const height = 844 // iPhone 14 Pro height
            const left = (window.screen.width - width) / 2
            const top = (window.screen.height - height) / 2

            window.open(
                url,
                'MobilePreview',
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
            )
        }
    }

    return (
        <header className="h-14 flex items-center justify-between px-4 bg-white border-b border-slate-200 flex-shrink-0">
            {/* Left */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/proposals')}
                    className="h-9 w-9"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>

                <div className="h-6 w-px bg-slate-200" />

                <div>
                    <h1 className="text-sm font-semibold text-slate-900 line-clamp-1">
                        {proposal.active_version?.title || 'Nova Proposta'}
                    </h1>
                </div>
            </div>

            {/* Center - Save Status */}
            <div className="flex items-center gap-2 text-xs">
                {isSaving ? (
                    <>
                        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                        <span className="text-slate-500">Salvando...</span>
                    </>
                ) : isDirty ? (
                    <>
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-slate-500">Alterações não salvas</span>
                    </>
                ) : (
                    <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-slate-500">Salvo</span>
                    </>
                )}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
                {/* Preview Button with Dropdown */}
                <div className="relative" ref={menuRef}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPreviewMenu(!showPreviewMenu)}
                        disabled={!proposal.public_token}
                        className="gap-1.5"
                    >
                        <Eye className="h-4 w-4" />
                        Preview
                        <ChevronDown className={cn(
                            "h-3.5 w-3.5 transition-transform duration-200",
                            showPreviewMenu && "rotate-180"
                        )} />
                    </Button>

                    {/* Dropdown Menu */}
                    {showPreviewMenu && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="py-1">
                                <button
                                    onClick={() => handlePreview('desktop')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    <Monitor className="h-4 w-4 text-slate-400" />
                                    <div className="text-left">
                                        <div className="font-medium">Desktop</div>
                                        <div className="text-xs text-slate-400">Abrir em nova aba</div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => handlePreview('mobile')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    <Smartphone className="h-4 w-4 text-slate-400" />
                                    <div className="text-left">
                                        <div className="font-medium">Mobile</div>
                                        <div className="text-xs text-slate-400">Simular iPhone (390×844)</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                >
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </div>
        </header>
    )
}

export default BuilderHeader
