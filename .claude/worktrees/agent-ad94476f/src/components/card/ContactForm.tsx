import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'

type Contato = Database['public']['Tables']['contatos']['Row']
import { getTipoPessoa } from '../../lib/contactUtils'
import { Loader2, X, Link, Globe, UserPlus, Search } from 'lucide-react'
import { ORIGEM_OPTIONS, needsOrigemDetalhe } from '../../lib/constants/origem'
import { useDuplicateDetection } from '../../hooks/useDuplicateDetection'
import DuplicateWarningPanel from '../contacts/DuplicateWarningPanel'
import { parseSupabaseContactError } from '../../lib/supabaseErrorParser'
import { cn } from '../../lib/utils'
import { ContactMeiosEditor } from './ContactMeiosEditor'
import { useMondeSearch, useMondeImportPerson } from '../../hooks/useMondeSearch'


interface ContactFormProps {
    contact?: Contato
    onSave: (contact: Contato) => void
    onCancel: () => void
    initialName?: string
    onSelectExisting?: (contactId: string, mergeData?: Record<string, string | null>) => void
}

export default function ContactForm({ contact, onSave, onCancel, initialName = '', onSelectExisting }: ContactFormProps) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [potentialGuardians, setPotentialGuardians] = useState<Contato[]>([])
    const [dismissed, setDismissed] = useState(false)
    const mondeCheck = useMondeSearch()
    const mondeImport = useMondeImportPerson()
    const [mondeChecked, setMondeChecked] = useState(false)
    const [skipMonde, setSkipMonde] = useState(false)

    const [formData, setFormData] = useState<Partial<Contato>>({
        nome: contact?.nome || initialName,
        sobrenome: contact?.sobrenome || '',
        tipo_pessoa: contact?.tipo_pessoa || 'adulto',
        ...contact
    })

    // Detecção de duplicados em tempo real
    const { duplicates, isChecking, hasHighConfidenceDuplicate, noDuplicatesFound } = useDuplicateDetection(
        {
            cpf: formData.cpf,
            email: formData.email,
            telefone: formData.telefone,
            nome: formData.nome,
            sobrenome: formData.sobrenome,
        },
        { excludeId: contact?.id }
    )

    // Reset dismissed quando duplicados mudam
    useEffect(() => {
        setDismissed(false)
    }, [duplicates])

    useEffect(() => {
        if (formData.data_nascimento) {
            const tipo = getTipoPessoa(formData.data_nascimento)
            setFormData(prev => ({ ...prev, tipo_pessoa: tipo }))
        }
    }, [formData.data_nascimento])

    useEffect(() => {
        if (formData.tipo_pessoa === 'crianca') {
            fetchPotentialGuardians()
        }
    }, [formData.tipo_pessoa])

    const fetchPotentialGuardians = async () => {
        setLoading(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder perde tipo com encadeamento dinâmico
            const { data } = await (supabase.from('contatos') as any)
                .select('*')
                .eq('tipo_pessoa', 'adulto')
                .is('deleted_at', null)
                .order('nome')

            if (data) {
                setPotentialGuardians(data)
            }
        } catch (error) {
            console.error('Error fetching guardians:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validação obrigatória para novos contatos
        if (!contact?.id) {
            const missing = []
            if (!formData.nome?.trim()) missing.push('Nome')
            if (!formData.sobrenome?.trim()) missing.push('Sobrenome')
            if (!formData.telefone?.trim()) missing.push('Telefone')
            if (missing.length > 0) {
                toast.error(`${missing.join(', ')} ${missing.length === 1 ? 'é obrigatório' : 'são obrigatórios'}`)
                return
            }

            // Check Monde before creating (first click)
            if (!mondeChecked && !skipMonde) {
                const searchTerm = `${formData.nome} ${formData.sobrenome || ''}`.trim()
                mondeCheck.search(searchTerm)
                setMondeChecked(true)
                return
            }
        }

        setSaving(true)

        try {
            // Build payload explicitly - do NOT spread formData as it may contain extra props (e.g., stats)
            const dataToSave = {
                nome: formData.nome || null,
                sobrenome: formData.sobrenome || null,
                tipo_pessoa: formData.tipo_pessoa || 'adulto',
                email: formData.email || null,
                telefone: formData.telefone || null,
                cpf: formData.cpf || null,
                passaporte: formData.passaporte || null,
                data_nascimento: formData.data_nascimento || null,
                responsavel_id: formData.tipo_pessoa === 'adulto' ? null : formData.responsavel_id,
                observacoes: formData.observacoes || null,
                origem: formData.origem || null,
                origem_detalhe: formData.origem_detalhe || null
            }

            let result
            if (contact?.id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder perde tipo com encadeamento dinâmico
                const { data, error } = await (supabase.from('contatos') as any)
                    .update(dataToSave)
                    .eq('id', contact.id)
                    .select()
                    .single()

                if (error) throw error
                result = data
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder perde tipo com encadeamento dinâmico
                const { data, error } = await (supabase.from('contatos') as any)
                    .insert(dataToSave)
                    .select()
                    .single()

                if (error) throw error
                result = data
            }

            onSave(result)
        } catch (error: unknown) {
            console.error('Error saving contact:', error)
            const parsed = parseSupabaseContactError(error)
            toast.error(parsed.message)
        } finally {
            setSaving(false)
        }
    }

    const isChild = formData.tipo_pessoa === 'crianca'
    const showWarning = !dismissed && duplicates.length > 0
    const warnSubmit = dismissed && hasHighConfidenceDuplicate

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-gray-50">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                    {contact ? 'Editar Contato' : 'Novo Contato'}
                </h3>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-gray-400 hover:text-gray-500"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Nome *</label>
                    <input
                        type="text"
                        required
                        value={formData.nome || ''}
                        onChange={e => setFormData({ ...formData, nome: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Sobrenome *</label>
                    <input
                        type="text"
                        required={!contact?.id}
                        value={formData.sobrenome || ''}
                        onChange={e => setFormData({ ...formData, sobrenome: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                    <input
                        type="date"
                        value={formData.data_nascimento || ''}
                        onChange={e => setFormData({ ...formData, data_nascimento: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo</label>
                    <select
                        value={formData.tipo_pessoa || ''}
                        onChange={(e) => setFormData({ ...formData, tipo_pessoa: e.target.value as 'adulto' | 'crianca' })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                    >
                        <option value="adulto">Adulto</option>
                        <option value="crianca">Não Adulto</option>
                    </select>
                </div>

                {isChild && (
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Responsável</label>
                        <select
                            value={formData.responsavel_id || ''}
                            onChange={e => setFormData({ ...formData, responsavel_id: e.target.value || null })}
                            disabled={loading}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                        >
                            <option value="">{loading ? 'Carregando...' : 'Selecione um responsável...'}</option>
                            {potentialGuardians.map(g => (
                                <option key={g.id} value={g.id}>{[g.nome, g.sobrenome].filter(Boolean).join(' ') || 'Sem nome'}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Telefone — sempre visível (obrigatório) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Telefone *</label>
                    <input
                        type="tel"
                        required={!contact?.id}
                        value={formData.telefone || ''}
                        onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                    />
                </div>

                {/* Only show these fields for Adults */}
                {!isChild && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input
                                type="email"
                                value={formData.email || ''}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">CPF</label>
                            <input
                                type="text"
                                value={formData.cpf || ''}
                                onChange={e => setFormData({ ...formData, cpf: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Passaporte</label>
                            <input
                                type="text"
                                value={formData.passaporte || ''}
                                onChange={e => setFormData({ ...formData, passaporte: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                            />
                        </div>
                    </>
                )}

                {/* Telefones e Emails adicionais (só para contatos existentes) */}
                {contact?.id && !isChild && (
                    <div className="col-span-2">
                        <ContactMeiosEditor contactId={contact.id} />
                    </div>
                )}

                <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Observações</label>
                    <textarea
                        rows={3}
                        value={formData.observacoes || ''}
                        onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                    />
                </div>

                {/* Origem do Contato */}
                <div className="col-span-2 space-y-2">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                        <Link className="w-3.5 h-3.5" />
                        Origem do Contato
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {ORIGEM_OPTIONS.map(opt => {
                            const selected = formData.origem === opt.value
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setFormData({
                                        ...formData,
                                        origem: selected ? null : opt.value,
                                        origem_detalhe: selected ? null : formData.origem_detalhe
                                    })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                        selected
                                            ? `${opt.color} ring-2 ring-offset-1 ring-indigo-500`
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            )
                        })}
                    </div>

                    {needsOrigemDetalhe(formData.origem) === 'indicacao' && (
                        <input
                            type="text"
                            placeholder="Quem indicou?"
                            value={formData.origem_detalhe || ''}
                            onChange={e => setFormData({ ...formData, origem_detalhe: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                        />
                    )}

                    {needsOrigemDetalhe(formData.origem) === 'mkt' && (
                        <input
                            type="text"
                            placeholder="Campanha / Fonte (opcional)"
                            value={formData.origem_detalhe || ''}
                            onChange={e => setFormData({ ...formData, origem_detalhe: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                        />
                    )}
                </div>
            </div>

            {/* Painel de duplicados */}
            {(showWarning || isChecking || noDuplicatesFound) && (
                <DuplicateWarningPanel
                    duplicates={duplicates}
                    isChecking={isChecking}
                    noDuplicatesFound={!dismissed && noDuplicatesFound}
                    newData={{
                        email: formData.email || null,
                        telefone: formData.telefone || null,
                        cpf: formData.cpf || null,
                    }}
                    onSelectExisting={(contactId, mergeData) => {
                        if (onSelectExisting) {
                            onSelectExisting(contactId, mergeData)
                        } else {
                            toast.info('Contato existente encontrado. Use a página de Pessoas para gerenciá-lo.')
                        }
                    }}
                    onDismiss={() => setDismissed(true)}
                    mode="full"
                />
            )}

            {/* Monde check results — shown before save for new contacts */}
            {!contact?.id && mondeChecked && (mondeCheck.isSearching || mondeCheck.results.length > 0) && (
                <div className="border border-indigo-200 rounded-lg overflow-hidden">
                    <div className="bg-indigo-50 px-3 py-2 flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-indigo-500" />
                        <span className="text-xs font-medium text-indigo-700">
                            {mondeCheck.isSearching ? 'Verificando no Monde...' : 'Encontrado no Monde — selecione ou crie novo'}
                        </span>
                    </div>
                    {mondeCheck.isSearching ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {mondeCheck.results.slice(0, 5).map(person => (
                                <button
                                    key={person.monde_person_id}
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const result = await mondeImport.mutateAsync({ mondePersonId: person.monde_person_id })
                                            const { data } = await supabase.from('contatos').select('*').eq('id', result.id).single()
                                            if (data) {
                                                toast.success(result.status === 'created' ? 'Contato importado do Monde' : 'Contato atualizado do Monde')
                                                onSave(data as Contato)
                                            }
                                        } catch {
                                            // Error handled by mutation
                                        }
                                    }}
                                    disabled={mondeImport.isPending}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 text-left transition-colors"
                                >
                                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                        <Globe className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">{person.name}</p>
                                        <p className="text-xs text-slate-400 truncate">
                                            {[person.email, person.phone].filter(Boolean).join(' · ')}
                                            {person.already_in_crm && ' · Já no CRM'}
                                        </p>
                                    </div>
                                    {mondeImport.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400 shrink-0" />
                                    ) : (
                                        <UserPlus className="h-4 w-4 text-indigo-400 shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!contact?.id && mondeChecked && !mondeCheck.isSearching && mondeCheck.results.length === 0 && (
                <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-green-600 text-xs">Nenhum contato similar no Monde. Pode criar.</span>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    Cancelar
                </button>
                <button
                    type={mondeChecked && mondeCheck.results.length > 0 && !skipMonde ? 'button' : 'submit'}
                    onClick={mondeChecked && mondeCheck.results.length > 0 && !skipMonde ? () => { setSkipMonde(true) } : undefined}
                    disabled={saving || mondeCheck.isSearching || mondeImport.isPending}
                    className={cn(
                        "inline-flex items-center px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50",
                        warnSubmit
                            ? "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
                            : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                    )}
                >
                    {(saving || mondeCheck.isSearching) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {mondeCheck.isSearching ? 'Verificando...' : mondeChecked && mondeCheck.results.length > 0 && !skipMonde ? 'Criar mesmo assim' : warnSubmit ? 'Salvar Mesmo Assim' : 'Salvar'}
                </button>
            </div>
        </form>
    )
}
