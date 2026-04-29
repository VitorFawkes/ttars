import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'

export interface Empresa {
    id: string
    nome: string
    observacoes: string | null
    created_at: string | null
    updated_at: string | null
    pessoas_count: number
    cards_abertos: number
    ultimo_contato_at: string | null
}

export function useEmpresas(searchQuery: string = '') {
    const { org } = useOrg()
    return useQuery<Empresa[]>({
        queryKey: ['empresas-list', org?.id, searchQuery],
        enabled: !!org?.id,
        staleTime: 30 * 1000,
        queryFn: async () => {
            let q = supabase
                .from('contatos')
                .select('id, nome, observacoes, created_at, updated_at')
                .eq('org_id', org!.id)
                .eq('tipo_contato', 'empresa')
                .is('deleted_at', null)
                .order('nome', { ascending: true })
                .limit(200)
            if (searchQuery.trim()) {
                q = q.ilike('nome', `%${searchQuery.trim()}%`)
            }
            const { data: empresas, error } = await q
            if (error) throw error
            const list = empresas ?? []
            if (list.length === 0) return []

            const ids = list.map(e => e.id)

            // Conta pessoas vinculadas a cada empresa
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: pessoas } = await (supabase.from('contatos') as any)
                .select('empresa_id')
                .in('empresa_id', ids)
                .is('deleted_at', null)
                .eq('tipo_contato', 'pessoa')
            const pessoasCount = new Map<string, number>()
            for (const row of (pessoas ?? []) as { empresa_id: string }[]) {
                pessoasCount.set(row.empresa_id, (pessoasCount.get(row.empresa_id) ?? 0) + 1)
            }

            // Conta cards abertos por empresa (pessoa_principal_id = empresa)
            const { data: cards } = await supabase
                .from('cards')
                .select('pessoa_principal_id, updated_at')
                .in('pessoa_principal_id', ids)
                .eq('produto', 'CORP')
                .in('status_comercial', ['aberto'])
                .is('deleted_at', null)
            const cardsAbertos = new Map<string, number>()
            const ultimoContato = new Map<string, string>()
            for (const row of (cards ?? []) as { pessoa_principal_id: string; updated_at: string | null }[]) {
                cardsAbertos.set(row.pessoa_principal_id, (cardsAbertos.get(row.pessoa_principal_id) ?? 0) + 1)
                const cur = ultimoContato.get(row.pessoa_principal_id)
                if (row.updated_at && (!cur || row.updated_at > cur)) {
                    ultimoContato.set(row.pessoa_principal_id, row.updated_at)
                }
            }

            return list.map((e): Empresa => ({
                id: e.id,
                nome: e.nome,
                observacoes: e.observacoes,
                created_at: e.created_at,
                updated_at: e.updated_at,
                pessoas_count: pessoasCount.get(e.id) ?? 0,
                cards_abertos: cardsAbertos.get(e.id) ?? 0,
                ultimo_contato_at: ultimoContato.get(e.id) ?? null,
            }))
        },
    })
}

interface CreateEmpresaInput {
    nome: string
    observacoes?: string
}

export function useCriarEmpresa() {
    const { org } = useOrg()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateEmpresaInput) => {
            if (!org?.id) throw new Error('Sem org ativa')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('contatos') as any)
                .insert({
                    nome: input.nome.trim(),
                    observacoes: input.observacoes?.trim() || null,
                    tipo_contato: 'empresa',
                    tipo_pessoa: 'adulto',
                    org_id: org.id,
                    origem: 'manual_corp',
                })
                .select('id, nome')
                .single()
            if (error) throw error
            return data as { id: string; nome: string }
        },
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['empresas-list', org?.id] })
            toast.success(`Empresa "${data.nome}" cadastrada.`)
        },
        onError: (err: Error) => {
            toast.error('Erro ao cadastrar empresa: ' + (err.message || 'desconhecido'))
        },
    })
}

export function useUpdateEmpresa() {
    const { org } = useOrg()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: { id: string; nome?: string; observacoes?: string | null }) => {
            const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
            if (input.nome !== undefined) update.nome = input.nome
            if (input.observacoes !== undefined) update.observacoes = input.observacoes
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('contatos') as any).update(update).eq('id', input.id)
            if (error) throw error
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['empresas-list', org?.id] })
            toast.success('Empresa atualizada.')
        },
        onError: (err: Error) => {
            toast.error('Erro ao atualizar: ' + (err.message || 'desconhecido'))
        },
    })
}
