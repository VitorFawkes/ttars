import { useState } from 'react'
import { Globe, Loader2, UserPlus, Check, Phone, Mail, Hash, AlertTriangle } from 'lucide-react'
import { useMondeSearch, useMondeImportPerson, type MondePersonResult } from '../../hooks/useMondeSearch'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'

function normalizeName(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .join(' ')
}

function namesAreSameLikely(a: string, b: string): boolean {
  const ta = normalizeName(a).split(' ').filter(Boolean)
  const tb = normalizeName(b).split(' ').filter(Boolean)
  if (ta.length === 0 || tb.length === 0) return false
  if (ta[0] !== tb[0]) return false
  if (ta.length === 1 || tb.length === 1) return true
  const setB = new Set(tb)
  const shared = ta.filter((t) => setB.has(t)).length
  return shared >= 2
}

interface DivergentMatch {
  person: MondePersonResult
  crmContatoId: string
  crmName: string
}

interface MondeSearchSectionProps {
  searchTerm: string
  onPersonImported: (contatoId: string) => void
  excludeMondeIds?: (string | null)[]
}

export default function MondeSearchSection({
  searchTerm,
  onPersonImported,
  excludeMondeIds = [],
}: MondeSearchSectionProps) {
  const { results, search, isSearching, clear } = useMondeSearch()
  const importMutation = useMondeImportPerson()
  const [importingId, setImportingId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [divergent, setDivergent] = useState<DivergentMatch | null>(null)

  const handleSearch = () => {
    setHasSearched(true)
    search(searchTerm)
  }

  const importNewSeparate = async (person: MondePersonResult) => {
    setImportingId(person.monde_person_id)
    try {
      const result = await importMutation.mutateAsync({
        mondePersonId: person.monde_person_id,
        forceCreateSeparate: true,
      })
      onPersonImported(result.id)
      toast.success('Novo contato criado a partir do Monde')
      setDivergent(null)
      clear()
    } finally {
      setImportingId(null)
    }
  }

  const handleImport = async (person: MondePersonResult) => {
    if (person.already_in_crm && person.crm_contato_id) {
      // Verificar se o contato vinculado no CRM tem nome compatível com o do Monde.
      // Casos onde casal/família compartilham email ou telefone causam vínculos cruzados.
      setImportingId(person.monde_person_id)
      try {
        const { data: crmContato } = await supabase
          .from('contatos')
          .select('id, nome, sobrenome')
          .eq('id', person.crm_contato_id)
          .maybeSingle()

        const crmFullName = crmContato
          ? `${crmContato.nome ?? ''} ${crmContato.sobrenome ?? ''}`.trim()
          : ''

        if (crmContato && crmFullName && !namesAreSameLikely(crmFullName, person.name)) {
          setDivergent({
            person,
            crmContatoId: crmContato.id,
            crmName: crmFullName,
          })
          return
        }

        onPersonImported(person.crm_contato_id)
        toast.success('Contato já existe no CRM')
      } finally {
        setImportingId(null)
      }
      return
    }

    setImportingId(person.monde_person_id)
    try {
      const result = await importMutation.mutateAsync({
        mondePersonId: person.monde_person_id,
      })
      onPersonImported(result.id)
      toast.success(
        result.status === 'created'
          ? 'Contato importado do Monde'
          : 'Contato atualizado do Monde'
      )
      clear()
    } finally {
      setImportingId(null)
    }
  }

  // Filter out contacts already shown in CRM results
  const excludeSet = new Set(excludeMondeIds.filter(Boolean))
  const filteredResults = results.filter(
    (r) => !excludeSet.has(r.monde_person_id)
  )

  if (!hasSearched) {
    return (
      <div className="border-t border-slate-100 pt-3 mt-3">
        <button
          onClick={handleSearch}
          disabled={isSearching || searchTerm.length < 2}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          Buscar no Monde
        </button>
      </div>
    )
  }

  if (divergent) {
    const isImporting = importingId === divergent.person.monde_person_id
    return (
      <div className="border-t border-slate-100 pt-3 mt-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-medium">Pessoas diferentes com mesmo contato</p>
              <p className="text-xs text-amber-800">
                <span className="font-semibold">{divergent.person.name}</span> (do Monde) está
                vinculado a <span className="font-semibold">{divergent.crmName}</span> no CRM —
                provavelmente compartilham email ou telefone. Qual você quer adicionar?
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                onPersonImported(divergent.crmContatoId)
                setDivergent(null)
                clear()
              }}
              disabled={isImporting}
              className="w-full text-sm font-medium px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Adicionar {divergent.crmName}
            </button>
            <button
              onClick={() => importNewSeparate(divergent.person)}
              disabled={isImporting}
              className="w-full text-sm font-medium px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isImporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar {divergent.person.name} como novo contato
            </button>
            <button
              onClick={() => setDivergent(null)}
              disabled={isImporting}
              className="w-full text-xs text-slate-500 hover:text-slate-700 py-1"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Globe className="h-3.5 w-3.5 text-indigo-500" />
        <span className="text-xs font-medium text-indigo-600 uppercase tracking-wide">
          Resultados do Monde
        </span>
        {isSearching && <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />}
      </div>

      {isSearching ? (
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Buscando no Monde...</span>
        </div>
      ) : filteredResults.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">
          Nenhum resultado encontrado no Monde para "{searchTerm}"
        </p>
      ) : (
        <div className="space-y-1 max-h-[240px] overflow-y-auto">
          {filteredResults.map((person) => (
            <button
              key={person.monde_person_id}
              onClick={() => handleImport(person)}
              disabled={importingId === person.monde_person_id}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors",
                person.already_in_crm
                  ? "bg-green-50 hover:bg-green-100"
                  : "hover:bg-indigo-50"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">
                    {person.name}
                  </span>
                  {person.already_in_crm && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                      <Check className="h-2.5 w-2.5" />
                      No CRM
                    </span>
                  )}
                  {person.code && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <Hash className="h-2.5 w-2.5" />
                      {person.code}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {person.email && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      {person.email}
                    </span>
                  )}
                  {person.phone && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3 shrink-0" />
                      {person.phone}
                    </span>
                  )}
                </div>
              </div>

              <div className="ml-2 shrink-0">
                {importingId === person.monde_person_id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                ) : person.already_in_crm ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <UserPlus className="h-4 w-4 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => { setHasSearched(false); clear() }}
        className="w-full text-xs text-slate-400 hover:text-slate-600 mt-2 py-1 transition-colors"
      >
        Fechar resultados do Monde
      </button>
    </div>
  )
}
