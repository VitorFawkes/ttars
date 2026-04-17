import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, Loader2, User } from 'lucide-react'
import { FieldWrapper } from './BaseField'
import type { BaseFieldProps } from './BaseField'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../database.types'

type Contato = Database['public']['Tables']['contatos']['Row']
import ContactSelector from '../../card/ContactSelector'
import { calculateAge, getContactSummary, formatContactName, getContactInitials } from '../../../lib/contactUtils'

interface Pessoas {
    adultos: number
    criancas?: number
    idades_criancas?: number[]
}

export default function PessoasField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText,
    cardId
}: BaseFieldProps) {
    const pessoasValue = (value as Pessoas | null | undefined) || { adultos: 2 }
    const [contacts, setContacts] = useState<Contato[]>([])

    const [showSelector, setShowSelector] = useState(false)
    const [removingId, setRemovingId] = useState<string | null>(null)

    const fetchContacts = async () => {
        if (!cardId) return

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { data, error } = await (supabase.from('cards_contatos') as any)
                .select(`
                    contato:contatos (*)
                `)
                .eq('card_id', cardId)
                .order('ordem')

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase join type
            const mappedContacts = data?.map((item: any) => item.contato).filter(Boolean) as Contato[] || []
            setContacts(mappedContacts)

            // Sync summary if we have contacts and we are in edit mode (onChange present)
            if (mappedContacts.length > 0 && onChange) {
                const summary = getContactSummary(mappedContacts.map(c => ({
                    ...c,
                    tipo_pessoa: (c.tipo_pessoa === 'adulto' || c.tipo_pessoa === 'crianca') ? c.tipo_pessoa : 'adulto'
                })) as Parameters<typeof getContactSummary>[0])
                const newPessoas: Pessoas = {
                    adultos: summary.adults,
                    criancas: summary.children,
                    idades_criancas: mappedContacts
                        .filter(c => c.tipo_pessoa === 'crianca' && c.data_nascimento)
                        .map(c => calculateAge(c.data_nascimento) || 0)
                }

                // Only update if different to avoid loops
                if (JSON.stringify(newPessoas) !== JSON.stringify(pessoasValue)) {
                    onChange(newPessoas)
                }
            }
        } catch (err) {
            console.error('Error fetching contacts:', err)
        }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch on cardId change only
    useEffect(() => { fetchContacts() }, [cardId])

    const handleRemoveContact = async (contactId: string) => {
        if (!cardId) return
        setRemovingId(contactId)
        try {
            const { error } = await supabase
                .from('cards_contatos')
                .delete()
                .eq('card_id', cardId)
                .eq('contato_id', contactId)

            if (error) throw error
            await fetchContacts()
        } catch (error) {
            console.error('Error removing contact:', error)
            alert('Erro ao remover contato')
        } finally {
            setRemovingId(null)
        }
    }

    // Legacy numeric update functions
    const updateAdultos = (val: number) => {
        if (onChange) onChange({ ...pessoasValue, adultos: Math.max(1, val) })
    }

    const updateCriancas = (val: number) => {
        if (!onChange) return
        const numCriancas = Math.max(0, val)
        const updated = { ...pessoasValue, criancas: numCriancas }

        if (numCriancas === 0) {
            delete updated.idades_criancas
        } else if (numCriancas > 0) {
            const currentIdades = pessoasValue.idades_criancas || []
            updated.idades_criancas = Array(numCriancas).fill(0).map((_, i) => currentIdades[i] || 0)
        }

        onChange(updated)
    }

    const updateIdadeCrianca = (index: number, idade: number) => {
        if (!onChange) return
        const idades = [...(pessoasValue.idades_criancas || [])]
        idades[index] = Math.max(0, Math.min(17, idade))
        onChange({ ...pessoasValue, idades_criancas: idades })
    }

    // Read-only view
    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span>
                            {pessoasValue.adultos} {pessoasValue.adultos === 1 ? 'adulto' : 'adultos'}
                            {pessoasValue.criancas && pessoasValue.criancas > 0 && (
                                <span className="text-gray-600">
                                    {' + '}{pessoasValue.criancas} {pessoasValue.criancas === 1 ? 'criança' : 'crianças'}
                                    {pessoasValue.idades_criancas && pessoasValue.idades_criancas.length > 0 && (
                                        <span className="text-gray-500 ml-1">
                                            ({pessoasValue.idades_criancas.join(', ')} anos)
                                        </span>
                                    )}
                                </span>
                            )}
                        </span>
                    </div>

                    {contacts.length > 0 && (
                        <div className="mt-2 space-y-1 pl-6 border-l-2 border-gray-100">
                            {contacts.map(contact => (
                                <div key={contact.id} className="text-xs text-gray-600 flex items-center gap-2">
                                    <User className="h-3 w-3" />
                                    <span>{formatContactName(contact)}</span>
                                    <span className="text-gray-400">({contact.tipo_pessoa})</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </FieldWrapper>
        )
    }

    // Edit view
    // If we have contacts linked, show the List View
    const showListView = contacts.length > 0

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="space-y-3">
                {showListView ? (
                    <div className="space-y-2">
                        {contacts.map(contact => (
                            <div key={contact.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md border text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-medium">
                                        {getContactInitials(contact)}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{formatContactName(contact) || 'Sem Nome'}</p>
                                        <p className="text-xs text-gray-500">
                                            {contact.tipo_pessoa}
                                            {contact.data_nascimento && ` • ${calculateAge(contact.data_nascimento)} anos`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemoveContact(contact.id)}
                                    disabled={removingId === contact.id}
                                    className="text-gray-400 hover:text-red-500 p-1"
                                >
                                    {removingId === contact.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        ))}

                        <button
                            type="button"
                            onClick={() => setShowSelector(true)}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            Adicionar Viajante
                        </button>
                    </div>
                ) : (
                    // Legacy Numeric View
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Adultos</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={pessoasValue.adultos}
                                    onChange={(e) => updateAdultos(parseInt(e.target.value) || 1)}
                                    onBlur={() => onSave?.()}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Crianças</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={pessoasValue.criancas || 0}
                                    onChange={(e) => updateCriancas(parseInt(e.target.value) || 0)}
                                    onBlur={() => onSave?.()}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                />
                            </div>
                        </div>

                        {pessoasValue.criancas && pessoasValue.criancas > 0 && (
                            <div>
                                <label className="block text-xs text-gray-600 mb-2">Idades das Crianças</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Array(pessoasValue.criancas).fill(0).map((_, idx) => (
                                        <input
                                            key={idx}
                                            type="number"
                                            min="0"
                                            max="17"
                                            value={pessoasValue.idades_criancas?.[idx] || 0}
                                            onChange={(e) => updateIdadeCrianca(idx, parseInt(e.target.value) || 0)}
                                            onBlur={() => onSave?.()}
                                            placeholder={`Criança ${idx + 1}`}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {cardId ? (
                            <div className="pt-2 border-t mt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowSelector(true)}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-md text-sm font-medium hover:bg-indigo-100 transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                    Adicionar Viajante Detalhado
                                </button>
                                <p className="text-[10px] text-gray-500 mt-1 text-center">
                                    Ao adicionar o primeiro viajante detalhado, a contagem manual acima será substituída pela lista de nomes.
                                </p>
                            </div>
                        ) : (
                            <div className="pt-2 border-t mt-2 text-center">
                                <p className="text-xs text-gray-400">
                                    Salve o card para adicionar viajantes detalhados.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showSelector && cardId && (
                <ContactSelector
                    cardId={cardId}
                    onClose={() => setShowSelector(false)}
                    multiSelect={true}
                    addToCard={false}
                    onContactsAdded={async (selectedContacts) => {
                        if (!cardId || selectedContacts.length === 0) return
                        try {
                            const { data: existing } = await supabase
                                .from('cards_contatos')
                                .select('ordem, contato_id')
                                .eq('card_id', cardId)
                                .order('ordem', { ascending: false })
                                .limit(1)
                            let nextOrder = (existing?.[0]?.ordem || 0) + 1
                            const existingIds = new Set(contacts.map(c => c.id))

                            for (const contact of selectedContacts) {
                                if (existingIds.has(contact.id)) continue
                                await supabase.from('cards_contatos').insert({
                                    card_id: cardId,
                                    contato_id: contact.id,
                                    tipo_viajante: 'acompanhante',
                                    ordem: nextOrder++
                                })
                            }
                            await fetchContacts()
                        } catch (err) {
                            console.error('Error batch adding contacts:', err)
                        }
                        setShowSelector(false)
                    }}
                    onContactAdded={() => {
                        fetchContacts()
                    }}
                />
            )}
        </FieldWrapper>
    )
}
