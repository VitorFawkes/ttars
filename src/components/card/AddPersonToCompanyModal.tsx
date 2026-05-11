import { useState } from 'react'
import { X, Building2, Loader2 } from 'lucide-react'
import { useCriarPessoaDaEmpresa, useUpdatePessoa, type EmpresaPessoa } from '../../hooks/useEmpresaPessoas'

interface AddPersonToCompanyModalProps {
    empresaId: string
    empresaNome: string
    onClose: () => void
    /** Quando passada, edita a pessoa em vez de criar */
    editPessoa?: EmpresaPessoa
}

export default function AddPersonToCompanyModal({
    empresaId,
    empresaNome,
    onClose,
    editPessoa,
}: AddPersonToCompanyModalProps) {
    const [nome, setNome] = useState(editPessoa
        ? `${editPessoa.nome ?? ''}${editPessoa.sobrenome ? ' ' + editPessoa.sobrenome : ''}`.trim()
        : '')
    const [cargo, setCargo] = useState(editPessoa?.cargo ?? '')
    const [telefone, setTelefone] = useState(editPessoa?.telefone ?? '')
    const [email, setEmail] = useState(editPessoa?.email ?? '')

    const criarMut = useCriarPessoaDaEmpresa()
    const updateMut = useUpdatePessoa()

    const isEdit = !!editPessoa
    const isPending = criarMut.isPending || updateMut.isPending

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nome.trim()) return

        if (isEdit) {
            await updateMut.mutateAsync({
                pessoa_id: editPessoa!.id,
                nome: nome.trim(),
                cargo: cargo.trim() || null,
                email: email.trim() || null,
                empresa_id_para_invalidar: empresaId,
            })
        } else {
            await criarMut.mutateAsync({
                empresa_id: empresaId,
                nome: nome.trim(),
                cargo: cargo.trim() || undefined,
                telefone: telefone.trim() || undefined,
                email: email.trim() || undefined,
            })
        }
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
                                {isEdit ? 'Editar pessoa' : 'Adicionar pessoa à empresa'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">{empresaNome}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-400"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">
                            Nome <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            placeholder="Ex: Beatriz Silva"
                            required
                            autoFocus
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Cargo</label>
                        <input
                            type="text"
                            value={cargo}
                            onChange={(e) => setCargo(e.target.value)}
                            placeholder="Ex: Secretaria executiva"
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>

                    {!isEdit && (
                        <div>
                            <label className="text-xs font-medium text-slate-700 mb-1 block">
                                Telefone (WhatsApp)
                            </label>
                            <input
                                type="tel"
                                value={telefone}
                                onChange={(e) => setTelefone(e.target.value)}
                                placeholder="Ex: (11) 99876-5432"
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">
                                Mensagens desse número virão direto pro card desta empresa.
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">E-mail</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@empresa.com"
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
                            disabled={isPending || !nome.trim()}
                            className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {isEdit ? 'Salvar' : 'Adicionar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
