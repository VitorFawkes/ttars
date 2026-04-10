import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

export interface MondePersonResult {
  monde_person_id: string
  name: string
  email: string | null
  phone: string | null
  cpf: string | null
  code: number | null
  registered_at: string | null
  already_in_crm: boolean
  crm_contato_id: string | null
}

interface MondeSearchResponse {
  results: MondePersonResult[]
  total_in_monde: number
  search_term: string
}

/**
 * Hook para buscar contatos no Monde V2 via edge function monde-people-search.
 * Retorna resultados do Monde com indicação de quais já existem no CRM.
 */
export function useMondeSearch() {
  const [results, setResults] = useState<MondePersonResult[]>([])

  const searchMutation = useMutation({
    mutationFn: async (searchTerm: string): Promise<MondeSearchResponse> => {
      const { data, error } = await supabase.functions.invoke('monde-people-search', {
        body: { search: searchTerm, limit: 10 },
      })

      if (error) throw new Error(error.message || 'Erro ao buscar no Monde')
      if (data?.error) throw new Error(data.error)

      return data as MondeSearchResponse
    },
    onSuccess: (data) => {
      setResults(data.results)
    },
    onError: (err: Error) => {
      setResults([])
      if (err.message.includes('429')) {
        toast.error('Monde API: limite de requisições excedido. Tente novamente em alguns segundos.')
      } else {
        toast.error(`Erro ao buscar no Monde: ${err.message}`)
      }
    },
  })

  const clear = () => {
    setResults([])
    searchMutation.reset()
  }

  return {
    results,
    search: searchMutation.mutate,
    isSearching: searchMutation.isPending,
    error: searchMutation.error,
    clear,
  }
}

interface ImportedContact {
  id: string
  monde_person_id: string
  status: 'created' | 'updated' | 'skipped' | 'error'
}

/**
 * Hook para importar um contato específico do Monde para o CRM.
 * Usa monde-people-import com { monde_person_id }.
 */
export function useMondeImportPerson() {
  return useMutation({
    mutationFn: async ({
      mondePersonId,
      forceUpdate = false,
    }: {
      mondePersonId: string
      forceUpdate?: boolean
    }): Promise<ImportedContact> => {
      const { data, error } = await supabase.functions.invoke('monde-people-import', {
        body: { monde_person_id: mondePersonId, force_update: forceUpdate },
      })

      if (error) throw new Error(error.message || 'Erro ao importar do Monde')
      if (data?.error) throw new Error(data.error)

      const result = data.results?.[0]
      if (!result) throw new Error('Nenhum resultado retornado')
      if (result.status === 'error') throw new Error(result.error || 'Erro ao importar')

      return {
        id: result.contato_id,
        monde_person_id: result.monde_person_id,
        status: result.status,
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao importar contato: ${err.message}`)
    },
  })
}
