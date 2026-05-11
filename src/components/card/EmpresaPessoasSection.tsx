import { useState } from 'react'
import { Plus, Pencil, Trash2, Phone, Mail, User, Loader2 } from 'lucide-react'
import { useEmpresaPessoas, useDesvincularPessoa, type EmpresaPessoa } from '../../hooks/useEmpresaPessoas'
import AddPersonToCompanyModal from './AddPersonToCompanyModal'

interface EmpresaPessoasSectionProps {
    empresaId: string
    empresaNome: string
}

function formatPhonePretty(value: string): string {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 13 && digits.startsWith('55')) {
        // 55 11 9 8765-4321
        return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`
    }
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    }
    return value
}

export default function EmpresaPessoasSection({ empresaId, empresaNome }: EmpresaPessoasSectionProps) {
    const { data: pessoas, isLoading } = useEmpresaPessoas(empresaId)
    const [showAdd, setShowAdd] = useState(false)
    const [editPessoa, setEditPessoa] = useState<EmpresaPessoa | null>(null)
    const desvincularMut = useDesvincularPessoa()

    const handleRemove = (pessoa: EmpresaPessoa) => {
        if (!confirm(`Desvincular ${pessoa.nome} de ${empresaNome}? A pessoa não será apagada — só não estará mais associada a esta empresa.`)) {
            return
        }
        desvincularMut.mutate({ pessoa_id: pessoa.id, empresa_id: empresaId })
    }

    return (
        <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Pessoas da empresa{pessoas && pessoas.length > 0 ? ` · ${pessoas.length}` : ''}
                </h4>
                <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                >
                    <Plus className="w-3 h-3" />
                    Adicionar
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-3 text-xs text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    Carregando pessoas...
                </div>
            ) : !pessoas || pessoas.length === 0 ? (
                <button
                    onClick={() => setShowAdd(true)}
                    className="w-full flex flex-col items-center justify-center py-3 border-2 border-dashed border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                >
                    <div className="h-7 w-7 rounded-full bg-slate-50 flex items-center justify-center mb-1 group-hover:bg-white">
                        <Plus className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 group-hover:text-indigo-700">
                        Cadastrar quem da empresa solicita atendimento
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        Mensagens desses números viram cards desta empresa
                    </p>
                </button>
            ) : (
                <ul className="space-y-1.5">
                    {pessoas.map((p) => {
                        const fullName = `${p.nome ?? ''}${p.sobrenome ? ' ' + p.sobrenome : ''}`.trim() || '(sem nome)'
                        const principalPhone = p.meios.find(m => m.tipo === 'whatsapp' && m.is_principal) ?? p.meios.find(m => m.tipo === 'whatsapp')
                        return (
                            <li
                                key={p.id}
                                className="group rounded-lg border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-slate-200 transition-colors px-2.5 py-2"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                        <div className="h-6 w-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-purple-600 font-semibold text-[10px] shrink-0 mt-0.5">
                                            {fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                                <span className="text-xs font-semibold text-slate-900 truncate">{fullName}</span>
                                                {p.cargo && (
                                                    <span className="text-[10px] text-slate-500 truncate">· {p.cargo}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-500">
                                                {principalPhone && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Phone className="w-2.5 h-2.5" />
                                                        {formatPhonePretty(principalPhone.valor)}
                                                    </span>
                                                )}
                                                {p.email && (
                                                    <span className="inline-flex items-center gap-1 truncate">
                                                        <Mail className="w-2.5 h-2.5" />
                                                        {p.email}
                                                    </span>
                                                )}
                                                {!principalPhone && !p.email && (
                                                    <span className="inline-flex items-center gap-1 text-amber-600">
                                                        <User className="w-2.5 h-2.5" />
                                                        sem telefone cadastrado
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button
                                            onClick={() => setEditPessoa(p)}
                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-white"
                                            title="Editar"
                                        >
                                            <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => handleRemove(p)}
                                            disabled={desvincularMut.isPending}
                                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-white disabled:opacity-50"
                                            title="Desvincular da empresa"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {showAdd && (
                <AddPersonToCompanyModal
                    empresaId={empresaId}
                    empresaNome={empresaNome}
                    onClose={() => setShowAdd(false)}
                />
            )}

            {editPessoa && (
                <AddPersonToCompanyModal
                    empresaId={empresaId}
                    empresaNome={empresaNome}
                    editPessoa={editPessoa}
                    onClose={() => setEditPessoa(null)}
                />
            )}
        </div>
    )
}
