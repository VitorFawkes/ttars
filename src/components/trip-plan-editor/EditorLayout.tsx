/**
 * EditorLayout — Layout 3 colunas do editor de portal da viagem.
 *
 * Esquerda: BlockPalette (paleta de blocos arrastáveis)
 * Centro: EditorCanvas (blocos organizados por dia)
 * Direita: Preview mobile em tempo real
 */

import { useNavigate } from 'react-router-dom'
import { useTripPlanEditor } from '@/hooks/useTripPlanEditor'
import { BlockPalette } from './BlockPalette'
import { EditorCanvas } from './EditorCanvas'
import { MobilePreview } from './MobilePreview'
import { Button } from '@/components/ui/Button'
import {
    ArrowLeft,
    Save,
    Send,

    Loader2,
    Check,
} from 'lucide-react'
import { toast } from 'sonner'

interface EditorLayoutProps {
    title: string
    isDirty: boolean
    isSaving: boolean
    proposalId: string
    tripPlanId: string
}

export function EditorLayout({
    title,
    isDirty,
    isSaving,
    proposalId,
    tripPlanId,
}: EditorLayoutProps) {
    const navigate = useNavigate()
    const { save, publishAll } = useTripPlanEditor()

    const handleSave = async () => {
        try {
            await save()
            toast.success('Alterações salvas')
        } catch {
            toast.error('Erro ao salvar')
        }
    }

    const handlePublish = async () => {
        try {
            await publishAll()
            toast.success('Portal publicado! O cliente já pode ver as atualizações.')
        } catch {
            toast.error('Erro ao publicar')
        }
    }

    return (
        <div className="h-dvh flex flex-col bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(`/proposals/${proposalId}/edit`)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5 text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                            Portal da Viagem
                        </h1>
                        <p className="text-xs text-slate-500">{title}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Status */}
                    <span className="text-xs text-slate-400 mr-2">
                        {isSaving ? (
                            <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Salvando...
                            </span>
                        ) : isDirty ? (
                            <span className="text-amber-500">Alterações não salvas</span>
                        ) : (
                            <span className="flex items-center gap-1 text-emerald-500">
                                <Check className="h-3 w-3" />
                                Salvo
                            </span>
                        )}
                    </span>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                    >
                        <Save className="h-4 w-4 mr-1" />
                        Salvar
                    </Button>

                    <Button
                        size="sm"
                        onClick={handlePublish}
                        disabled={isSaving}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Send className="h-4 w-4 mr-1" />
                        Publicar
                    </Button>
                </div>
            </header>

            {/* Main: 3 columns */}
            <div className="flex-1 flex min-h-0">
                {/* Left: Block Palette (200px) */}
                <BlockPalette />

                {/* Center: Canvas */}
                <div className="flex-1 h-full overflow-hidden">
                    <EditorCanvas tripPlanId={tripPlanId} />
                </div>

                {/* Right: Mobile Preview (320px) */}
                <MobilePreview />
            </div>
        </div>
    )
}
