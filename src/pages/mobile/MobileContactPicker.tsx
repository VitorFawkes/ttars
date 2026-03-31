import { useState, useEffect } from 'react'
import { Search, ArrowLeft, Plus, Loader2, Phone, User } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { cn, buildContactSearchFilter, normalizePhone } from '../../lib/utils'
import { formatContactName, getContactInitials, sanitizeContactNames } from '../../lib/contactUtils'
import { toast } from 'sonner'

interface MobileContactPickerProps {
  onSelect: (contactId: string, contactName: string) => void
  onClose: () => void
}

export default function MobileContactPicker({ onSelect, onClose }: MobileContactPickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newContact, setNewContact] = useState({ nome: '', sobrenome: '', telefone: '' })

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
      onSelect(data.id, name)
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
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={showCreate ? () => setShowCreate(false) : onClose}
            className="p-2 -ml-2 rounded-lg active:bg-slate-100"
            style={{ touchAction: 'manipulation' }}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <h2 className="text-base font-semibold text-slate-900">
            {showCreate ? 'Novo Contato' : 'Selecionar Contato'}
          </h2>
        </div>
      </div>

      {showCreate ? (
        /* ── Create Contact Form ── */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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

          {/* Create button */}
          <div className="pt-2">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newContact.nome.trim()}
              className={cn(
                "w-full py-3.5 rounded-xl font-semibold text-sm transition-all min-h-[52px]",
                "bg-indigo-600 text-white active:bg-indigo-700",
                "disabled:bg-slate-300 disabled:cursor-not-allowed"
              )}
              style={{ touchAction: 'manipulation' }}
            >
              {createMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Criar Contato'
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
          <div className="flex-1 overflow-y-auto">
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
                  return (
                    <button
                      key={contact.id}
                      onClick={() => onSelect(contact.id, name)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 text-left min-h-[56px]"
                      style={{ touchAction: 'manipulation' }}
                    >
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
              <div className="px-4 py-8 text-center">
                <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Nenhum contato encontrado</p>
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
                  // Pre-fill name from search
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
        </>
      )}
    </div>
  )
}
