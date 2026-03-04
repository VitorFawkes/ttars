import { useState, useEffect } from 'react'
import { Search, Plus, UserPlus, Loader2, AlertCircle, Calendar, Phone, Mail } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'
import { useDuplicateDetection } from '../../hooks/useDuplicateDetection'
import DuplicateWarningPanel from '../contacts/DuplicateWarningPanel'
import { parseSupabaseContactError } from '../../lib/supabaseErrorParser'
import { formatContactName, getContactInitials, sanitizeContactNames } from '../../lib/contactUtils'

interface ContactSelectorProps {
    cardId: string
    onClose: () => void
    onContactAdded: (contactId?: string, contact?: { nome: string }) => void
    addToCard?: boolean
}

export default function ContactSelector({ cardId, onClose, onContactAdded, addToCard = true }: ContactSelectorProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [newContact, setNewContact] = useState({
        nome: '',
        sobrenome: '',
        email: '',
        telefone: '',
        data_nascimento: '',
        tipo_pessoa: 'adulto' as 'adulto' | 'crianca'
    })

    // Detecção de duplicados na criação rápida
    const { duplicates, isChecking: isCheckingDuplicates, noDuplicatesFound } = useDuplicateDetection(
        {
            nome: newContact.nome,
            sobrenome: newContact.sobrenome,
            email: newContact.email,
            telefone: newContact.telefone,
        },
        { enabled: showCreateForm }
    )

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
        return () => clearTimeout(timer)
    }, [searchTerm])

    // Search contacts
    const { data: contacts, isLoading } = useQuery({
        queryKey: ['contacts-search', debouncedSearch],
        queryFn: async () => {
            if (!debouncedSearch) return []

            const { data, error } = await supabase
                .from('contatos')
                .select('*')
                .is('deleted_at', null)
                .or(`nome.ilike.%${debouncedSearch}%,sobrenome.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,telefone.ilike.%${debouncedSearch}%`)
                .limit(8)

            if (error) throw error
            return data as Database['public']['Tables']['contatos']['Row'][]
        },
        enabled: debouncedSearch.length > 2
    })

    // Create contact mutation
    const createContactMutation = useMutation({
        mutationFn: async () => {
            setError(null)
            const { nome, sobrenome } = sanitizeContactNames(newContact.nome, newContact.sobrenome || null)
            const payload = {
                nome,
                sobrenome,
                email: newContact.email.trim() || null,
                telefone: newContact.telefone.trim() || null,
                data_nascimento: newContact.data_nascimento || null,
                tipo_pessoa: newContact.tipo_pessoa
            }

            const { data, error } = await supabase
                .from('contatos')
                .insert(payload)
                .select()
                .single()

            if (error) throw error

            // Also insert into contato_meios for multi-contact support
            const meiosToInsert = []
            if (payload.telefone) {
                meiosToInsert.push({
                    contato_id: data.id,
                    tipo: 'telefone',
                    valor: payload.telefone,
                    is_principal: true,
                    origem: 'manual'
                })
            }
            if (payload.email) {
                meiosToInsert.push({
                    contato_id: data.id,
                    tipo: 'email',
                    valor: payload.email,
                    is_principal: true,
                    origem: 'manual'
                })
            }

            if (meiosToInsert.length > 0) {
                // Ignore duplicates — unique index (tipo, valor_normalizado) may reject if phone/email already exists
                await supabase.from('contato_meios').upsert(meiosToInsert, { onConflict: 'tipo,valor_normalizado', ignoreDuplicates: true })
            }

            return data
        },
        onSuccess: async (createdContact) => {
            try {
                if (cardId && addToCard) {
                    // Check if already linked
                    const { data: existingLink } = await supabase
                        .from('cards_contatos')
                        .select('id')
                        .eq('card_id', cardId)
                        .eq('contato_id', createdContact.id)
                        .single()

                    if (!existingLink) {
                        const { data: existing } = await supabase
                            .from('cards_contatos')
                            .select('ordem')
                            .eq('card_id', cardId)
                            .order('ordem', { ascending: false })
                            .limit(1)

                        const nextOrder = (existing?.[0]?.ordem || 0) + 1

                        await supabase.from('cards_contatos').insert({
                            card_id: cardId,
                            contato_id: createdContact.id,
                            tipo_viajante: 'acompanhante',
                            ordem: nextOrder
                        })
                    }
                }

                onContactAdded(createdContact.id, { nome: formatContactName(createdContact) || createdContact.nome || 'Sem Nome' })
                onClose()
            } catch (err: unknown) {
                console.error('Error linking contact:', err)
                setError('Contato criado, mas houve erro ao vincular: ' + (err instanceof Error ? err.message : String(err)))
            }
        },
        onError: (err: unknown) => {
            console.error('Error creating contact:', err)
            const parsed = parseSupabaseContactError(err)
            setError(parsed.message)
        }
    })

    // Add contact to card
    const addContactMutation = useMutation({
        mutationFn: async (contactId: string) => {
            setError(null)
            if (!cardId || !addToCard) return contactId

            const { data: existingLink } = await supabase
                .from('cards_contatos')
                .select('id')
                .eq('card_id', cardId)
                .eq('contato_id', contactId)
                .single()

            if (existingLink) return contactId

            const { data: existing } = await supabase
                .from('cards_contatos')
                .select('ordem')
                .eq('card_id', cardId)
                .order('ordem', { ascending: false })
                .limit(1)

            const nextOrder = (existing?.[0]?.ordem || 0) + 1

            const { error } = await supabase.from('cards_contatos').insert({
                card_id: cardId,
                contato_id: contactId,
                tipo_viajante: 'acompanhante',
                ordem: nextOrder
            })

            if (error && error.code !== '23505') throw error
            return contactId
        },
        onSuccess: (contactId) => {
            const contact = contacts?.find(c => c.id === contactId)
            onContactAdded(contactId, contact ? { nome: formatContactName(contact) || 'Sem Nome' } : undefined)
            onClose()
        },
        onError: (err: Error) => {
            setError('Erro ao adicionar contato: ' + err.message)
        }
    })

    const handleCreateContact = () => {
        if (!newContact.nome.trim()) {
            setError('Nome é obrigatório')
            return
        }
        createContactMutation.mutate()
    }

    const resetForm = () => {
        setShowCreateForm(false)
        setNewContact({ nome: '', sobrenome: '', email: '', telefone: '', data_nascimento: '', tipo_pessoa: 'adulto' })
        setError(null)
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden gap-0">
                <div className="p-6 pb-4 border-b border-slate-100">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold text-slate-900">
                            {showCreateForm ? 'Novo Contato' : 'Selecionar Contato'}
                        </DialogTitle>
                    </DialogHeader>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-sm text-red-700">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {!showCreateForm ? (
                        <div className="space-y-4">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Buscar por nome, email ou telefone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                    autoFocus
                                />
                            </div>

                            {/* Results */}
                            <div className="min-h-[200px] max-h-[300px] overflow-y-auto -mx-2 px-2 space-y-1">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                                        <Loader2 className="h-6 w-6 animate-spin mb-2" />
                                        <span className="text-sm">Buscando contatos...</span>
                                    </div>
                                ) : contacts?.length ? (
                                    contacts.map((contact) => (
                                        <button
                                            key={contact.id}
                                            onClick={() => addContactMutation.mutate(contact.id)}
                                            disabled={addContactMutation.isPending}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg group transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-medium group-hover:bg-indigo-100 transition-colors flex-shrink-0">
                                                    {getContactInitials(contact)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-slate-900 truncate">{formatContactName(contact) || 'Sem Nome'}</p>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                                        {contact.telefone && (
                                                            <span className="flex items-center gap-1">
                                                                <Phone className="h-3 w-3" />
                                                                {contact.telefone}
                                                            </span>
                                                        )}
                                                        {contact.email && (
                                                            <span className="flex items-center gap-1 truncate">
                                                                <Mail className="h-3 w-3" />
                                                                {contact.email}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {addContactMutation.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-indigo-600 flex-shrink-0" />
                                            ) : (
                                                <Plus className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" />
                                            )}
                                        </button>
                                    ))
                                ) : debouncedSearch.length > 2 ? (
                                    <div className="text-center py-8">
                                        <p className="text-sm text-slate-500 mb-3">Nenhum contato encontrado</p>
                                        <Button
                                            onClick={() => {
                                                setShowCreateForm(true)
                                                const parts = searchTerm.trim().split(/\s+/)
                                                if (parts.length > 1) {
                                                    setNewContact(prev => ({ ...prev, nome: parts[0], sobrenome: parts.slice(1).join(' ') }))
                                                } else {
                                                    setNewContact(prev => ({ ...prev, nome: searchTerm }))
                                                }
                                            }}
                                            variant="outline"
                                            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                        >
                                            <UserPlus className="h-4 w-4 mr-2" />
                                            Criar "{searchTerm}"
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-slate-400">
                                        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">Digite para buscar ou crie um novo contato</p>
                                    </div>
                                )}
                            </div>

                            {/* Create button */}
                            <div className="pt-4 border-t border-slate-100">
                                <Button
                                    onClick={() => setShowCreateForm(true)}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Criar Novo Contato
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Progress Header */}
                            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-medium text-indigo-700">
                                            Criação Rápida
                                        </span>
                                        <span className="text-xs text-indigo-600 font-medium">
                                            {[newContact.nome, newContact.telefone || newContact.email, newContact.data_nascimento].filter(Boolean).length}/3 campos
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                            style={{
                                                width: `${([newContact.nome, newContact.telefone || newContact.email, newContact.data_nascimento].filter(Boolean).length / 3) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Essential: Name */}
                            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-600">
                                        <UserPlus className="h-3.5 w-3.5" />
                                    </div>
                                    Dados Essenciais
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            Nome <span className="text-red-500">*</span>
                                        </label>
                                        <Input
                                            type="text"
                                            value={newContact.nome}
                                            onChange={(e) => setNewContact({ ...newContact, nome: e.target.value })}
                                            placeholder="Ex: João"
                                            autoFocus
                                            className={cn(
                                                newContact.nome && "border-green-300 bg-green-50/30"
                                            )}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            Sobrenome
                                        </label>
                                        <Input
                                            type="text"
                                            value={newContact.sobrenome}
                                            onChange={(e) => setNewContact({ ...newContact, sobrenome: e.target.value })}
                                            placeholder="Ex: Silva"
                                            className={cn(
                                                newContact.sobrenome && "border-green-300 bg-green-50/30"
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Phone + Email in same section */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            <Phone className="inline h-3.5 w-3.5 mr-1 text-slate-500" />
                                            Telefone
                                        </label>
                                        <Input
                                            type="tel"
                                            value={newContact.telefone}
                                            onChange={(e) => setNewContact({ ...newContact, telefone: e.target.value })}
                                            placeholder="(11) 99999-9999"
                                            className={cn(
                                                newContact.telefone && "border-green-300 bg-green-50/30"
                                            )}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            <Mail className="inline h-3.5 w-3.5 mr-1 text-slate-500" />
                                            Email
                                        </label>
                                        <Input
                                            type="email"
                                            value={newContact.email}
                                            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                                            placeholder="email@exemplo.com"
                                            className={cn(
                                                newContact.email && "border-green-300 bg-green-50/30"
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Optional: Birth Date + Type */}
                            <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                    <div className="p-1.5 rounded-md bg-slate-200/50 text-slate-500">
                                        <Calendar className="h-3.5 w-3.5" />
                                    </div>
                                    Informações Adicionais
                                    <span className="text-xs font-normal text-slate-400">(opcional)</span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            Data de Nascimento
                                        </label>
                                        <Input
                                            type="date"
                                            value={newContact.data_nascimento}
                                            onChange={(e) => setNewContact({ ...newContact, data_nascimento: e.target.value })}
                                            className={cn(
                                                newContact.data_nascimento && "border-green-300 bg-green-50/30"
                                            )}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            Tipo de Pessoa
                                        </label>
                                        <select
                                            value={newContact.tipo_pessoa}
                                            onChange={(e) => setNewContact({ ...newContact, tipo_pessoa: e.target.value as 'adulto' | 'crianca' })}
                                            className="w-full h-11 px-4 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                        >
                                            <option value="adulto">Adulto</option>
                                            <option value="crianca">Não Adulto</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Painel de duplicados */}
                            {(duplicates.length > 0 || isCheckingDuplicates || noDuplicatesFound) && (
                                <DuplicateWarningPanel
                                    duplicates={duplicates}
                                    isChecking={isCheckingDuplicates}
                                    noDuplicatesFound={noDuplicatesFound}
                                    onSelectExisting={(contactId) => addContactMutation.mutate(contactId)}
                                    mode="compact"
                                />
                            )}

                            {/* Hint - more compact */}
                            {duplicates.length === 0 && (
                                <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                    <span className="text-amber-500">💡</span>
                                    <p className="text-xs text-amber-700">
                                        Após criar, acesse o contato para adicionar endereço, documentos e mais.
                                    </p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-3 border-t border-slate-100">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={resetForm}
                                    className="flex-1"
                                >
                                    Voltar
                                </Button>
                                <Button
                                    onClick={handleCreateContact}
                                    disabled={createContactMutation.isPending || !newContact.nome.trim()}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                >
                                    {createContactMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Criar e Adicionar
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
