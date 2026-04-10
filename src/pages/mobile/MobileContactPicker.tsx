import { useState, useEffect } from 'react'
import { Search, ArrowLeft, Plus, Loader2, Phone, User, Check, Globe, UserPlus } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { cn, buildContactSearchFilter, normalizePhone } from '../../lib/utils'
import { formatContactName, getContactInitials, sanitizeContactNames } from '../../lib/contactUtils'
import { toast } from 'sonner'
import MondeSearchSection from '../../components/contacts/MondeSearchSection'
import { useMondeSearch, useMondeImportPerson } from '../../hooks/useMondeSearch'

interface SelectedContact {
  id: string
  name: string
}

interface MobileContactPickerProps {
  onConfirm: (contacts: SelectedContact[]) => void
  onClose: () => void
  alreadySelected?: string[]
}

export default function MobileContactPicker({ onConfirm, onClose, alreadySelected = [] }: MobileContactPickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<SelectedContact[]>([])
  const [newContact, setNewContact] = useState({ nome: '', sobrenome: '', telefone: '' })
  const mondeCheck = useMondeSearch()
  const mondeImport = useMondeImportPerson()
  const [mondeChecked, setMondeChecked] = useState(false)
  const [skipMonde, setSkipMonde] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['mobile-contacts-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return []
      const searchFilter = buildContactSearchFilter(debouncedSearch)

      const [{ data: primaryResults, error }, meiosContactIds] = await Promise.all([
        supabase
          .from('contatos')
          .select('id, nome, sobrenome, telefone, email')
          .is('deleted_at', null)
          .or(searchFilter)
          .limit(8),
        (async () => {
          const normalized = normalizePhone(debouncedSearch)
          if (normalized.length < 4) return [] as string[]
          const { data } = await supabase
            .from('contato_meios')
            .select('contato_id')
            .in('tipo', ['telefone', 'whatsapp'])
            .ilike('valor_normalizado', `%${normalized}%`)
            .limit(10)
          return (data || []).map(m => m.contato_id)
        })()
      ])

      if (error) throw error
      const primaryIds = new Set((primaryResults || []).map(c => c.id))
      const extraIds = meiosContactIds.filter(id => !primaryIds.has(id))
      let allContacts = primaryResults || []

      if (extraIds.length > 0) {
        const { data: extraContacts } = await supabase
          .from('contatos')
          .select('id, nome, sobrenome, telefone, email')
          .in('id', extraIds)
          .is('deleted_at', null)
          .limit(8)
        if (extraContacts) allContacts = [...allContacts, ...extraContacts]
      }

      return allContacts
    },
    enabled: debouncedSearch.length >= 2
  })

  const toggleContact = (id: string, name: string) => {
    setSelected(prev => {
      if (prev.some(c => c.id === id)) return prev.filter(c => c.id !== id)
      return [...prev, { id, name }]
    })
  }

  const isChecked = (id: string) => selected.some(c => c.id === id) || alreadySelected.includes(id)
  const isDisabled = (id: string) => alreadySelected.includes(id)

  const createMutation = useMutation({
    mutationFn: async () => {
      const { nome, sobrenome } = sanitizeContactNames(newContact.nome, newContact.sobrenome || null)
      const telefone = newContact.telefone.trim() || null

      const { data, error } = await supabase
        .from('contatos')
        .insert({ nome, sobrenome, telefone, tipo_pessoa: 'adulto' })
        .select('id, nome, sobrenome')
        .single()

      if (error) throw error

      if (telefone) {
        await supabase.from('contato_meios').upsert([{
          contato_id: data.id,
          tipo: 'telefone',
          valor: telefone,
          is_principal: true,
          origem: 'manual'
        }], { onConflict: 'tipo,valor_normalizado', ignoreDuplicates: true })
      }

      return data
    },
    onSuccess: (data) => {
      const name = formatContactName(data) || data.nome || 'Sem Nome'
      toast.success(`Contato "${name}" criado`)
      setSelected(prev => [...prev, { id: data.id, name }])
      setShowCreate(false)
      setNewContact({ nome: '', sobrenome: '', telefone: '' })
    },
    onError: (err: Error) => {
      toast.error('Erro ao criar contato: ' + err.message)
    }
  })

  const handleCreate = () => {
    if (!newContact.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    // Check Monde first
    if (!mondeChecked && !skipMonde) {
      const searchTerm = `${newContact.nome} ${newContact.sobrenome}`.trim()
      mondeCheck.search(searchTerm)
      setMondeChecked(true)
      return
    }

    createMutation.mutate()
  }

  const handleConfirm = () => {
    onConfirm(selected)
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={showCreate ? () => setShowCreate(false) : onClose}
              className="p-2 -ml-2 rounded-lg active:bg-slate-100"
              style={{ touchAction: 'manipulation' }}
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <h2 className="text-base font-semibold text-slate-900">
              {showCreate ? 'Novo Contato' : 'Selecionar Pessoas'}
            </h2>
          </div>
          {selected.length > 0 && !showCreate && (
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              {selected.length} selecionado{selected.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {showCreate ? (
        /* ── Create Contact Form ── */
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div>
            <label className="text-sm font-medium text-slate-700">Nome *</label>
            <input
              type="text"
              autoCapitalize="words"
              autoFocus
              value={newContact.nome}
              onChange={e => setNewContact(p => ({ ...p, nome: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nome"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Sobrenome</label>
            <input
              type="text"
              autoCapitalize="words"
              value={newContact.sobrenome}
              onChange={e => setNewContact(p => ({ ...p, sobrenome: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Sobrenome"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Telefone</label>
            <input
              type="tel"
              value={newContact.telefone}
              onChange={e => setNewContact(p => ({ ...p, telefone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="(11) 99999-9999"
            />
          </div>

          {/* Monde check results */}
          {mondeChecked && (mondeCheck.isSearching || mondeCheck.results.length > 0) && (
            <div className="border border-indigo-200 rounded-xl overflow-hidden">
              <div className="bg-indigo-50 px-3 py-2 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-xs font-medium text-indigo-700">
                  {mondeCheck.isSearching ? 'Verificando no Monde...' : 'Encontrado no Monde'}
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
                      onClick={async () => {
                        try {
                          const result = await mondeImport.mutateAsync({ mondePersonId: person.monde_person_id })
                          const { data } = await supabase.from('contatos').select('id, nome, sobrenome').eq('id', result.id).single()
                          if (data) {
                            const name = formatContactName(data) || data.nome || 'Sem Nome'
                            setSelected(prev => [...prev, { id: data.id, name }])
                            setShowCreate(false)
                            setMondeChecked(false)
                            setSkipMonde(false)
                            mondeCheck.clear()
                            toast.success('Contato importado do Monde')
                          }
                        } catch {
                          // Error handled by mutation
                        }
                      }}
                      disabled={mondeImport.isPending}
                      className="w-full flex items-center gap-3 px-3 py-3 active:bg-indigo-50 text-left"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <Globe className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{person.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {[person.email, person.phone].filter(Boolean).join(' · ')}
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

          {mondeChecked && !mondeCheck.isSearching && mondeCheck.results.length === 0 && (
            <div className="p-2.5 bg-green-50 border border-green-200 rounded-xl">
              <span className="text-green-600 text-xs">Nenhum contato similar no Monde. Pode criar.</span>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => {
                if (mondeChecked && mondeCheck.results.length > 0 && !skipMonde) {
                  setSkipMonde(true)
                  createMutation.mutate()
                } else {
                  handleCreate()
                }
              }}
              disabled={createMutation.isPending || mondeCheck.isSearching || mondeImport.isPending || !newContact.nome.trim()}
              className={cn(
                "w-full py-3.5 rounded-xl font-semibold text-sm transition-all min-h-[52px]",
                "bg-indigo-600 text-white active:bg-indigo-700",
                "disabled:bg-slate-300 disabled:cursor-not-allowed"
              )}
              style={{ touchAction: 'manipulation' }}
            >
              {createMutation.isPending || mondeCheck.isSearching ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : mondeChecked && mondeCheck.results.length > 0 && !skipMonde ? (
                'Criar mesmo assim'
              ) : (
                'Criar e Selecionar'
              )}
            </button>
          </div>
        </div>
      ) : (
        /* ── Search + Results ── */
        <>
          {/* Search */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="search"
                inputMode="search"
                autoFocus
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Buscar por nome ou telefone..."
              />
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}

            {!isLoading && contacts && contacts.length > 0 && (
              <div className="divide-y divide-slate-100">
                {contacts.map(contact => {
                  const name = formatContactName(contact) || contact.nome || 'Sem Nome'
                  const initials = getContactInitials(contact)
                  const checked = isChecked(contact.id)
                  const disabled = isDisabled(contact.id)
                  return (
                    <button
                      key={contact.id}
                      onClick={() => !disabled && toggleContact(contact.id, name)}
                      disabled={disabled}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[56px]",
                        disabled ? "opacity-50" : "active:bg-slate-50"
                      )}
                      style={{ touchAction: 'manipulation' }}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        'w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                        checked
                          ? 'bg-indigo-600 border-indigo-600'
                          : 'border-slate-300 bg-white'
                      )}>
                        {checked && <Check className="w-4 h-4 text-white" />}
                      </div>

                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-indigo-700">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                        {contact.telefone && (
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />
                            {contact.telefone}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {!isLoading && debouncedSearch.length >= 2 && (!contacts || contacts.length === 0) && (
              <div className="px-4 py-6 text-center">
                <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Nenhum contato encontrado</p>
                <div className="mt-2">
                  <MondeSearchSection
                    searchTerm={debouncedSearch}
                    onPersonImported={async (contatoId) => {
                      const { data } = await supabase
                        .from('contatos')
                        .select('id, nome, sobrenome')
                        .eq('id', contatoId)
                        .single()
                      if (data) {
                        const name = formatContactName(data) || data.nome || 'Sem Nome'
                        setSelected(prev => [...prev, { id: data.id, name }])
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {!isLoading && debouncedSearch.length >= 2 && contacts && contacts.length > 0 && contacts.length < 3 && (
              <div className="px-4">
                <MondeSearchSection
                  searchTerm={debouncedSearch}
                  onPersonImported={async (contatoId) => {
                    const { data } = await supabase
                      .from('contatos')
                      .select('id, nome, sobrenome')
                      .eq('id', contatoId)
                      .single()
                    if (data) {
                      const name = formatContactName(data) || data.nome || 'Sem Nome'
                      setSelected(prev => [...prev, { id: data.id, name }])
                    }
                  }}
                  excludeMondeIds={[]}
                />
              </div>
            )}

            {!debouncedSearch && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-400">Digite para buscar contatos</p>
              </div>
            )}

            {/* Create new button */}
            <div className="px-4 py-4">
              <button
                onClick={() => {
                  setShowCreate(true)
                  if (searchTerm.trim()) {
                    const parts = searchTerm.trim().split(/\s+/)
                    setNewContact({
                      nome: parts[0] || '',
                      sobrenome: parts.slice(1).join(' '),
                      telefone: ''
                    })
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-600 active:bg-slate-50 min-h-[52px]"
                style={{ touchAction: 'manipulation' }}
              >
                <Plus className="w-4 h-4" />
                Criar novo contato
              </button>
            </div>
          </div>

          {/* Bottom confirm */}
          <div className="flex-shrink-0 bg-white border-t border-slate-200">
            <div className="px-4 py-3">
              <button
                onClick={handleConfirm}
                disabled={selected.length === 0}
                className={cn(
                  "w-full py-3.5 rounded-xl font-semibold text-sm transition-all min-h-[52px]",
                  "bg-indigo-600 text-white active:bg-indigo-700",
                  "disabled:bg-slate-300 disabled:cursor-not-allowed",
                  "shadow-lg shadow-indigo-600/20"
                )}
                style={{ touchAction: 'manipulation' }}
              >
                {selected.length === 0
                  ? 'Selecione pessoas'
                  : `Confirmar ${selected.length} pessoa${selected.length !== 1 ? 's' : ''}`
                }
              </button>
            </div>
            <div className="safe-area-inset-bottom bg-white" />
          </div>
        </>
      )}
    </div>
  )
}
