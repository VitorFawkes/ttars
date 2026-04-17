import { useState } from 'react'
import { Globe, Loader2, UserPlus, Check, Phone, Mail, Hash } from 'lucide-react'
import { useMondeSearch, useMondeImportPerson, type MondePersonResult } from '../../hooks/useMondeSearch'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'

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

  const handleSearch = () => {
    setHasSearched(true)
    search(searchTerm)
  }

  const handleImport = async (person: MondePersonResult) => {
    if (person.already_in_crm && person.crm_contato_id) {
      onPersonImported(person.crm_contato_id)
      toast.success('Contato já existe no CRM')
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
