import { useState, useEffect } from 'react'
import { Save, Globe, Users, Lock } from 'lucide-react'

interface SaveReportDialogProps {
    open: boolean
    onClose: () => void
    onSave: (params: { title: string; description: string; visibility: 'private' | 'team' | 'everyone' }) => void
    initialTitle?: string
    initialDescription?: string
    initialVisibility?: 'private' | 'team' | 'everyone'
    isEditing?: boolean
    saving?: boolean
    error?: string | null
}

const VISIBILITY_OPTIONS = [
    { value: 'private' as const, label: 'Só eu', icon: Lock, desc: 'Apenas você pode ver' },
    { value: 'team' as const, label: 'Meu time', icon: Users, desc: 'Membros do seu time' },
    { value: 'everyone' as const, label: 'Todos', icon: Globe, desc: 'Toda a empresa' },
]

export default function SaveReportDialog({ open, ...props }: SaveReportDialogProps) {
    if (!open) return null
    return <SaveReportDialogInner {...props} />
}

function SaveReportDialogInner({
    onClose,
    onSave,
    initialTitle = '',
    initialDescription = '',
    initialVisibility = 'private',
    isEditing = false,
    saving = false,
    error = null,
}: Omit<SaveReportDialogProps, 'open'>) {
    const [title, setTitle] = useState(initialTitle)
    const [description, setDescription] = useState(initialDescription)
    const [visibility, setVisibility] = useState(initialVisibility)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const canSave = title.trim().length > 0 && !saving

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    {isEditing ? 'Atualizar Relatório' : 'Salvar Relatório'}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Título</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: Cards por Etapa do Funil"
                            autoFocus
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Descrição (opcional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="O que este relatório mostra..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-2">Visibilidade</label>
                        <div className="space-y-1.5">
                            {VISIBILITY_OPTIONS.map((opt) => {
                                const Icon = opt.icon
                                const isActive = visibility === opt.value
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => setVisibility(opt.value)}
                                        className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                                            isActive
                                                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                                                : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 flex-shrink-0" />
                                        <div className="text-left">
                                            <div className="font-medium">{opt.label}</div>
                                            <div className="text-[11px] text-slate-400">{opt.desc}</div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {error && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSave({ title: title.trim(), description: description.trim(), visibility })}
                        disabled={!canSave}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvando...' : isEditing ? 'Atualizar' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
