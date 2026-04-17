import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { Button } from '@/components/ui/Button'
import {
    ArrowLeft,
    Check,
    Loader2,
    Eye,
    Monitor,
    Smartphone,
    Send,
    Link2,
    Copy,
    MoreHorizontal,
    History,
    Trash2,
    FileDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ProposalFull } from '@/types/proposals'

interface BuilderHeaderProps {
    proposal: ProposalFull
}

export function BuilderHeader({ proposal }: BuilderHeaderProps) {
    const navigate = useNavigate()
    const { isDirty, isSaving, publish } = useProposalBuilder()
    const [showPreviewMenu, setShowPreviewMenu] = useState(false)
    const [showMoreMenu, setShowMoreMenu] = useState(false)
    const [isPublishing, setIsPublishing] = useState(false)
    const previewRef = useRef<HTMLDivElement>(null)
    const moreRef = useRef<HTMLDivElement>(null)

    // Close dropdowns on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (previewRef.current && !previewRef.current.contains(e.target as Node)) setShowPreviewMenu(false)
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMoreMenu(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const title = proposal.active_version?.title || 'Nova Proposta'

    const handlePublish = async () => {
        setIsPublishing(true)
        try {
            const token = await publish()
            if (token) {
                const url = `${window.location.origin}/p/${token}`
                await navigator.clipboard.writeText(url)
                toast.success('Proposta publicada! Link copiado.')
            }
        } catch {
            toast.error('Erro ao publicar proposta')
        } finally {
            setIsPublishing(false)
        }
    }

    const handleCopyLink = () => {
        if (!proposal.public_token) return
        const url = `${window.location.origin}/p/${proposal.public_token}`
        navigator.clipboard.writeText(url)
        toast.success('Link copiado!')
    }

    const handlePreview = (mode: 'desktop' | 'mobile') => {
        setShowPreviewMenu(false)
        if (!proposal.public_token) return
        const baseUrl = `/p/${proposal.public_token}`
        if (mode === 'desktop') {
            window.open(baseUrl, '_blank')
        } else {
            const url = `${baseUrl}?mode=mobile`
            window.open(url, 'MobilePreview', `width=390,height=844,left=${(screen.width - 390) / 2},top=${(screen.height - 844) / 2},resizable=yes,scrollbars=yes`)
        }
    }

    return (
        <header className="h-14 flex items-center justify-between px-4 bg-white border-b border-slate-200 flex-shrink-0 gap-4">
            {/* Left — Back + Breadcrumb */}
            <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="icon" onClick={() => navigate('/proposals')} className="h-8 w-8 flex-shrink-0">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-slate-400 hidden sm:inline">/</span>
                <button onClick={() => navigate('/proposals')} className="text-xs text-slate-400 hover:text-slate-600 transition-colors hidden sm:inline">
                    Propostas
                </button>
                <span className="text-xs text-slate-400 hidden sm:inline">/</span>
                <h1 className="text-sm font-medium text-slate-900 truncate max-w-[240px]">{title}</h1>
            </div>

            {/* Center — Save Status */}
            <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                {isSaving ? (
                    <>
                        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                        <span className="text-slate-400">Salvando...</span>
                    </>
                ) : isDirty ? (
                    <>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span className="text-slate-400">Alteracoes pendentes</span>
                    </>
                ) : (
                    <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-slate-400">Salvo</span>
                    </>
                )}
            </div>

            {/* Right — Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
                {/* Copy Link */}
                {proposal.public_token && (
                    <Button variant="ghost" size="sm" onClick={handleCopyLink} className="gap-1.5 text-xs h-8">
                        <Link2 className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Copiar Link</span>
                    </Button>
                )}

                {/* Preview */}
                <div className="relative" ref={previewRef}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPreviewMenu(!showPreviewMenu)}
                        disabled={!proposal.public_token}
                        className="gap-1.5 text-xs h-8"
                    >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                    </Button>
                    {showPreviewMenu && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-slate-200 shadow-lg z-50 overflow-hidden">
                            <button onClick={() => handlePreview('desktop')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                <Monitor className="h-4 w-4 text-slate-400" />
                                Desktop
                            </button>
                            <button onClick={() => handlePreview('mobile')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                <Smartphone className="h-4 w-4 text-slate-400" />
                                Mobile
                            </button>
                        </div>
                    )}
                </div>

                {/* Publish */}
                <Button size="sm" onClick={handlePublish} disabled={isPublishing || isSaving} className="gap-1.5 text-xs h-8">
                    {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar
                </Button>

                {/* More */}
                <div className="relative" ref={moreRef}>
                    <Button variant="ghost" size="icon" onClick={() => setShowMoreMenu(!showMoreMenu)} className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    {showMoreMenu && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-50 overflow-hidden">
                            <button onClick={() => { setShowMoreMenu(false); handleCopyLink() }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                <Copy className="h-4 w-4 text-slate-400" />
                                Copiar Link
                            </button>
                            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                <History className="h-4 w-4 text-slate-400" />
                                Historico de Versoes
                            </button>
                            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                <FileDown className="h-4 w-4 text-slate-400" />
                                Exportar PDF
                            </button>
                            <div className="border-t border-slate-100" />
                            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" />
                                Excluir Proposta
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
