import { useState } from 'react'
import { X, Building2, Loader2 } from 'lucide-react'
import { useCriarEmpresa } from '../../hooks/useEmpresas'

interface CreateCompanyModalProps {
    onClose: () => void
    onCreated?: (empresaId: string) => void
}

export default function CreateCompanyModal({ onClose, onCreated }: CreateCompanyModalProps) {
    const [nome, setNome] = useState('')
    const [observacoes, setObservacoes] = useState('')
    const criarMut = useCriarEmpresa()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nome.trim()) return
        const result = await criarMut.mutateAsync({
            nome,
            observacoes: observacoes.trim() || undefined,
        })
        onCreated?.(result.id)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md">
                <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                                Nova empresa
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Cadastre uma empresa-cliente. Depois você pode adicionar as pessoas dela.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-400"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">
                            Nome da empresa <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            placeholder="Ex: Magazine Luiza"
                            required
                            autoFocus
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">
                            Observações
                        </label>
                        <textarea
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            rows={3}
                            placeholder="Notas internas (ex: contrato corporativo desde 2024, prefere atendimento por WhatsApp...)"
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={criarMut.isPending || !nome.trim()}
                            className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            {criarMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Cadastrar empresa
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
